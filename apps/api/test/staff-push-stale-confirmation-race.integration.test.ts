import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reconcileStaleStaffPushRegistrations } from "../src/modules/staff-push/staff-push-maintenance-repository";
import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();
let sequence = 0;

async function ageRegistration(registrationId: string) {
  const client = await fixture.databasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_registrations
       SET created_at = clock_timestamp() - interval '31 days',
           last_confirmed_at = clock_timestamp() - interval '30 days',
           updated_at = clock_timestamp()
       WHERE id = $1`,
      [registrationId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
  await fixture.query(
    `CREATE TRIGGER ${name} BEFORE UPDATE ON staff_push_registrations
     FOR EACH ROW WHEN (OLD.id = '${registrationId}'::uuid AND ${condition})
     EXECUTE FUNCTION ${name}()`,
  );
  return async () => {
    await fixture.query(`DROP TRIGGER ${name} ON staff_push_registrations`);
    await fixture.query(`DROP FUNCTION ${name}()`);
  };
}

async function waitForBlockedUpdate(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event = 'advisory'
         AND query ILIKE '%staff_push_registrations%'`,
    );
    if (result.rows[0]!.count !== "0") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the controlled advisory-lock race.");
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
    const removeTrigger = await installBlockingTrigger(
      registrationId,
      lockKey,
      "CONFIRMATION",
    );
    await blocker.query("SELECT pg_advisory_lock($1)", [lockKey]);
    try {
      const confirmation = fixture.put(auth, body);
      await waitForBlockedUpdate();
      await expect(
        reconcileStaleStaffPushRegistrations(fixture.databasePool(), 30),
      ).resolves.toEqual({
        disabledRegistrations: 0,
        suppressedDeliveries: 0,
      });
      await blocker.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      expect((await confirmation).status).toBe(200);
    } finally {
      await blocker.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      blocker.release();
      await removeTrigger();
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
    const removeTrigger = await installBlockingTrigger(
      registrationId,
      lockKey,
      "STALE",
    );
    await blocker.query("SELECT pg_advisory_lock($1)", [lockKey]);
    try {
      const maintenance = reconcileStaleStaffPushRegistrations(
        fixture.databasePool(),
        30,
      );
      await waitForBlockedUpdate();
      const confirmation = fixture.put(auth, body);
      await blocker.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      await expect(maintenance).resolves.toMatchObject({
        disabledRegistrations: 1,
      });
      const replacement = await confirmation;
      expect(replacement.status).toBe(200);
      expect(replacement.body?.registrationId).not.toBe(registrationId);
    } finally {
      await blocker.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      blocker.release();
      await removeTrigger();
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
