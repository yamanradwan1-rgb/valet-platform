import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reconcileStaleStaffPushRegistrations } from "../src/modules/staff-push/staff-push-maintenance-repository";
import { StaffPushApiFixture } from "./staff-push-api-fixture";
import { withStaffPushFixtureGuardsDisabled } from "./staff-push-fixture-guard";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";
import { waitForAdvisoryLock } from "./management-settings-lock-observer";
import type { PoolClient } from "pg";

const fixture = new StaffPushApiFixture();
let sequence = 0;

async function ageRegistration(registrationId: string) {
  await withStaffPushFixtureGuardsDisabled(fixture.databasePool(), new URL(fixture.migrationDatabaseUrl()).pathname.slice(1), ["staff_push_registrations"], async (client) => {
    await client.query(
      `UPDATE staff_push_registrations
       SET created_at = clock_timestamp() - interval '31 days',
           last_confirmed_at = clock_timestamp() - interval '30 days',
           updated_at = clock_timestamp()
       WHERE id = $1`,
      [registrationId],
    );
  });
}

async function installBlockingTrigger(
  registrationId: string,
  lockKey: number,
  winner: "CONFIRMATION" | "STALE",
) {
  sequence += 1;
  const name = `mob020d_stale_race_${process.pid}_${sequence}`;
  const condition =
    winner === "CONFIRMATION"
      ? "NEW.state = 'ACTIVE' AND NEW.last_confirmed_at IS DISTINCT FROM OLD.last_confirmed_at"
      : "NEW.state = 'DISABLED' AND NEW.terminal_reason_class = 'STALE_CONFIRMATION_TIMEOUT'";
  await fixture.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS
     'BEGIN PERFORM pg_advisory_xact_lock(${lockKey}); RETURN NEW; END'`,
  );
  try {
    await fixture.query(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON staff_push_registrations
       FOR EACH ROW WHEN (OLD.id = '${registrationId}'::uuid AND ${condition})
       EXECUTE FUNCTION ${name}()`,
    );
  } catch (error) {
    await fixture.query(`DROP FUNCTION ${name}()`);
    throw error;
  }
  return async () => {
    await fixture.query(`DROP TRIGGER ${name} ON staff_push_registrations`);
    await fixture.query(`DROP FUNCTION ${name}()`);
  };
}

async function waitForBlockedUpdate(blockerPid: number): Promise<void> {
  const [backendPid] = await waitForPostgresBlockingEdge(
    fixture.databasePool(),
    { blockerPid, timeoutMs: 2_000 },
  );
  await waitForAdvisoryLock(fixture.databasePool(), { backendPid: backendPid! }, "ExclusiveLock", false);
}

async function releaseBlocker(blocker: PoolClient, lockKey: number) {
  try {
    await blocker.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  } catch (error) {
    blocker.release(true);
    throw error;
  }
  blocker.release();
}

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("DEC-076 confirmation and stale-maintenance races", () => {
  it("keeps the row ACTIVE when authenticated confirmation wins", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const created = await fixture.put(auth, body);
    const registrationId = fixture.registrationId(created);
    await ageRegistration(registrationId);
    const lockKey = 76_001;
    const blocker = await fixture.databasePool().connect();
    let removeTrigger: Awaited<ReturnType<typeof installBlockingTrigger>> | undefined;
    let released = false;
    let confirmation: ReturnType<typeof fixture.put> | undefined;
    try {
      removeTrigger = await installBlockingTrigger(registrationId, lockKey, "CONFIRMATION");
      await blocker.query("SELECT pg_advisory_lock($1)", [lockKey]);
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      confirmation = fixture.put(auth, body);
      void confirmation.catch(() => undefined);
      await waitForBlockedUpdate(blockerPid);
      await expect(
        reconcileStaleStaffPushRegistrations(fixture.runtimeDatabasePool(), 30),
      ).resolves.toEqual({
        disabledRegistrations: 0,
        suppressedDeliveries: 0,
      });
      released = true;
      await releaseBlocker(blocker, lockKey);
      expect((await confirmation).status).toBe(200);
    } finally {
      try {
        if (!released) await releaseBlocker(blocker, lockKey);
      } finally {
        await confirmation?.catch(() => undefined);
        await removeTrigger?.();
      }
    }
    const row = (await fixture.registrations()).rows.find(
      (candidate) => candidate.id === registrationId,
    )!;
    expect(row.state).toBe("ACTIVE");
    expect(row.last_confirmed_at.getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  it("keeps the old row terminal and creates a fresh ACTIVE row when maintenance wins", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const created = await fixture.put(auth, body);
    const registrationId = fixture.registrationId(created);
    const original = (await fixture.registrations()).rows.find(
      (candidate) => candidate.id === registrationId,
    )!;
    await ageRegistration(registrationId);
    const lockKey = 76_002;
    const blocker = await fixture.databasePool().connect();
    let removeTrigger: Awaited<ReturnType<typeof installBlockingTrigger>> | undefined;
    let released = false;
    let maintenance: ReturnType<typeof reconcileStaleStaffPushRegistrations> | undefined;
    let confirmation: ReturnType<typeof fixture.put> | undefined;
    try {
      removeTrigger = await installBlockingTrigger(registrationId, lockKey, "STALE");
      await blocker.query("SELECT pg_advisory_lock($1)", [lockKey]);
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      maintenance = reconcileStaleStaffPushRegistrations(
        fixture.runtimeDatabasePool(),
        30,
      );
      void maintenance.catch(() => undefined);
      await waitForBlockedUpdate(blockerPid);
      confirmation = fixture.put(auth, body);
      void confirmation.catch(() => undefined);
      released = true;
      await releaseBlocker(blocker, lockKey);
      await expect(maintenance).resolves.toMatchObject({
        disabledRegistrations: 1,
      });
      const replacement = await confirmation;
      expect(replacement.status).toBe(200);
      expect(replacement.body?.registrationId).not.toBe(registrationId);
    } finally {
      try {
        if (!released) await releaseBlocker(blocker, lockKey);
      } finally {
        await maintenance?.catch(() => undefined);
        await confirmation?.catch(() => undefined);
        await removeTrigger?.();
      }
    }
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows.find((row) => row.id === registrationId)).toMatchObject({
      provider_token: null,
      state: "DISABLED",
      terminal_reason_class: "STALE_CONFIRMATION_TIMEOUT",
      token_hash: original.token_hash,
    });
    expect(rows.filter((row) => row.state === "ACTIVE")).toHaveLength(1);
  });
});
