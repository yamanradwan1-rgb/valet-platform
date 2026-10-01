import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminPool,
  runtimePool,
  fixture,
  startPhysicalResourceRuntime,
  stopPhysicalResourceRuntime,
} from "./physical-resource-runtime-test-fixture";

beforeAll(startPhysicalResourceRuntime, 120_000);
afterAll(stopPhysicalResourceRuntime, 60_000);
const sql =
  "SELECT * FROM public.management_physical_resource_create_parking_zone($1,$2,$3,$4,$5,$6,$7)";
async function waitForLock(pid: number) {
  await expect
    .poll(
      async () =>
        (
          await adminPool.query(
            "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
            [pid],
          )
        ).rows[0]?.wait_event_type,
      { timeout: 5000 },
    )
    .toBe("Lock");
}
const revocations = {
  actor:
    "UPDATE users SET status='DISABLED' WHERE id=(SELECT user_id FROM organization_memberships WHERE id=$1)",
  membership:
    "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
  organization: "UPDATE organizations SET status='INACTIVE' WHERE id=$2",
  entitlement:
    "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$2",
  location:
    "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$3",
  grant:
    "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$3",
};
function revoke(client: PoolClient, statement: string, params: string[]) {
  // Bind all three values even when only a subset is used by a statement.
  return client.query(
    `WITH scope AS (SELECT $1::uuid,$2::uuid,$3::uuid) ${statement}`,
    params,
  );
}

describe("Issue #236 persisted authority races", () => {
  it.each(Object.entries(revocations))(
    "denies a create waiting behind committed %s loss before mutation/replay",
    async (_name, statement) => {
      const f = await fixture();
      const authority = [f.managerMembershipId, f.organizationId, f.locationA];
      const params = [
        ...authority,
        randomUUID(),
        "c".repeat(64),
        "BLOCKED",
        "Blocked",
      ];
      const revoker = await adminPool.connect();
      const creator = await runtimePool.connect();
      try {
        await revoker.query("BEGIN");
        await revoke(revoker, statement, authority);
        const pid = Number(
          (await creator.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid,
        );
        const pending = creator.query(sql, params).then(
          () => "CREATED",
          (error: { code: string }) => error.code,
        );
        await waitForLock(pid);
        await revoker.query("COMMIT");
        expect(await pending).toBe("42501");
        const counts = await adminPool.query(
          `SELECT
        (SELECT count(*) FROM parking_zones WHERE location_id=$1 AND code='BLOCKED')::text AS zones,
        (SELECT count(*) FROM audit_events WHERE location_id=$1 AND event_type='PARKING_ZONE_CREATED')::text AS audits`,
          [f.locationA],
        );
        expect(counts.rows[0]).toEqual({ zones: "0", audits: "0" });
      } finally {
        await revoker.query("ROLLBACK");
        revoker.release();
        creator.release();
      }
    },
  );
  it("holds entitlement authority through commit and rechecks it before successful replay", async () => {
    const f = await fixture();
    const creator = await runtimePool.connect();
    const revoker = await adminPool.connect();
    const params = [
      f.managerMembershipId,
      f.organizationId,
      f.locationA,
      randomUUID(),
      "d".repeat(64),
      "HELD",
      "Held",
    ];
    try {
      await creator.query("BEGIN");
      expect((await creator.query(sql, params)).rows[0]?.result_code).toBe(
        "OK",
      );
      const pid = Number(
        (await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid,
      );
      const pending = revoker.query(
        "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
        [f.organizationId],
      );
      await waitForLock(pid);
      await creator.query("COMMIT");
      await pending;
      await expect(creator.query(sql, params)).rejects.toMatchObject({
        code: "42501",
      });
      const count = await adminPool.query(
        "SELECT count(*)::text FROM audit_events WHERE organization_id=$1 AND idempotency_key=$2",
        [f.organizationId, params[3]],
      );
      expect(count.rows[0]?.count).toBe("1");
    } finally {
      await creator.query("ROLLBACK");
      creator.release();
      revoker.release();
    }
  });
});
