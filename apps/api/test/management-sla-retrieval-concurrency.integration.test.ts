import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Phase4RetrievalCancellationTestContext } from "./phase4-retrieval-cancellation-test-context";
import {
  waitForAdvisoryLock,
  waitForLockWait,
} from "./management-settings-race-test-helpers";

const context = new Phase4RetrievalCancellationTestContext("be10-sla-race");

beforeAll(() => context.setupGate(), 120_000);
afterAll(() => context.teardownGate(), 60_000);

async function createAdmin(organizationId: string): Promise<string> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@be10-sla-race.test`],
  );
  await context.adminPool.query(
    `INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp())`,
    [membershipId, organizationId, userId],
  );
  return membershipId;
}

async function currentTarget(locationId: string, value: number | null) {
  const result = await context.adminPool.query<{ updated_at: Date }>(
    `UPDATE locations SET sla_target_seconds=$2,updated_at=clock_timestamp()
     WHERE id=$1 RETURNING updated_at`,
    [locationId, value],
  );
  return result.rows[0]!.updated_at;
}

async function snapshots(sessionId: string) {
  return (await context.adminPool.query<{
    snapshot: number | null;
    status: string;
  }>(
    `SELECT sla_target_seconds_snapshot AS snapshot,status::text
     FROM retrieval_requests WHERE valet_session_id=$1
     ORDER BY requested_at,id`,
    [sessionId],
  )).rows;
}

async function close(client: PoolClient, resolution: "COMMIT" | "ROLLBACK") {
  try { await client.query(resolution); }
  finally { client.release(); }
}

describe("MGT-BE-10 SLA target versus Guest Retrieval serialization", () => {
  it("request-first snapshots the old target before a later target change commits", async () => {
    const parked = await context.createParkedFixture();
    const actor = await createAdmin(parked.organizationId);
    const revision = await currentTarget(parked.locationId, 300);
    const auditBlocker = await context.adminPool.connect();
    await auditBlocker.query("BEGIN");
    await auditBlocker.query("LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE");
    const request = context.guestPost(
      parked.guestToken,
      "/v1/guest/session/request-retrieval",
    );
    await waitForLockWait(context.adminPool, "INSERT INTO audit_events");
    await waitForAdvisoryLock(
      context.adminPool,
      "INSERT INTO audit_events",
      "ShareLock",
      true,
    );

    const setting = await context.runtimePool.connect();
    await setting.query("BEGIN");
    const mutation = setting.query(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,420,$4)`,
      [actor, parked.organizationId, parked.locationId, revision],
    );
    void mutation.catch(() => undefined);
    await waitForAdvisoryLock(
      context.adminPool,
      "management_settings_set_location_sla_target",
      "ExclusiveLock",
      false,
    );
    await close(auditBlocker, "COMMIT");
    expect(await request).toMatchObject({ status: 200, body: { state: "REQUESTED" } });
    await mutation;
    await close(setting, "COMMIT");
    expect(await snapshots(parked.sessionId)).toEqual([
      { snapshot: 300, status: "OPEN" },
    ]);
  });

  it("target-first commit makes the later Guest request snapshot the new target", async () => {
    const parked = await context.createParkedFixture();
    const actor = await createAdmin(parked.organizationId);
    const revision = await currentTarget(parked.locationId, 420);
    const setting = await context.runtimePool.connect();
    await setting.query("BEGIN");
    const changed = await setting.query<{ changed: boolean }>(
      `SELECT * FROM management_settings_set_location_sla_target($1,$2,$3,600,$4)`,
      [actor, parked.organizationId, parked.locationId, revision],
    );
    expect(changed.rows[0]?.changed).toBe(true);
    const request = context.guestPost(
      parked.guestToken,
      "/v1/guest/session/request-retrieval",
    );
    await waitForAdvisoryLock(
      context.adminPool,
      "pg_advisory_xact_lock_shared",
      "ShareLock",
      false,
    );
    await close(setting, "COMMIT");
    expect(await request).toMatchObject({ status: 200, body: { state: "REQUESTED" } });
    expect(await snapshots(parked.sessionId)).toEqual([
      { snapshot: 600, status: "OPEN" },
    ]);
  });

  it("cancellation preserves the old attempt while a later request snapshots the then-current target", async () => {
    const parked = await context.createParkedFixture();
    await currentTarget(parked.locationId, 300);
    const first = await context.requestRetrieval(parked);
    expect(await snapshots(parked.sessionId)).toEqual([
      { snapshot: 300, status: "OPEN" },
    ]);
    expect(await context.cancel(first)).toMatchObject({
      body: { state: "PARKED" }, status: 200,
    });
    await currentTarget(parked.locationId, 420);
    await context.requestRetrieval(parked);
    expect(await snapshots(parked.sessionId)).toEqual([
      { snapshot: 300, status: "CANCELLED" },
      { snapshot: 420, status: "OPEN" },
    ]);
  });

  it("snapshots NULL when no target exists", async () => {
    const parked = await context.createParkedFixture();
    await currentTarget(parked.locationId, null);
    await context.requestRetrieval(parked);
    expect(await snapshots(parked.sessionId)).toEqual([
      { snapshot: null, status: "OPEN" },
    ]);
  });
});
