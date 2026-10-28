import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { DashboardTestContext } from "./dashboard-test-context";

const context = new DashboardTestContext("authorization_join_fence");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const fence = `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`;
async function blocked(pid: number) {
  await vi.waitFor(
    async () => {
      const result = await context.adminPool.query(
        "SELECT cardinality(pg_blocking_pids($1)) AS n",
        [pid],
      );
      expect(result.rows[0].n).toBeGreaterThan(0);
    },
    { timeout: 2000 },
  );
}

describe("joined Dashboard scope keeps the existing revocation fence", () => {
  it.each(["GRANT", "ENTITLEMENT"] as const)(
    "waits for a prior %s writer then denies on the fresh post-fence read",
    async (kind) => {
      const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
      const reader = await context.runtimePool.connect();
      const writer = await context.adminPool.connect();
      try {
        const pid = (await reader.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid;
        await reader.query("BEGIN");
        await writer.query("BEGIN");
        await writer.query(fence, [actor.organizationId]);
        if (kind === "GRANT")
          await writer.query(
            "DELETE FROM membership_location_access WHERE membership_id=$1",
            [actor.membershipId],
          );
        else
          await writer.query(
            "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
            [actor.organizationId],
          );
        const pending = authorizeDashboardReadLocation(reader, {
          authenticatedUserId: actor.userId,
          targetLocationId: actor.locationId,
          capability: "LOCATION_DASHBOARD_READ",
        }).catch((error: unknown) => error);
        await blocked(pid);
        await writer.query("COMMIT");
        expect(await pending).toBeNull();
      } finally {
        await writer.query("ROLLBACK");
        writer.release();
        await reader.query("ROLLBACK");
        reader.release();
      }
    },
  );

  it("keeps a later managed writer waiting through the read transaction", async () => {
    const actor = await context.createFixture({ role: "LOCATION_MANAGER" });
    const reader = await context.runtimePool.connect();
    const writer = await context.adminPool.connect();
    try {
      await reader.query("BEGIN");
      expect(
        await authorizeDashboardReadLocation(reader, {
          authenticatedUserId: actor.userId,
          targetLocationId: actor.locationId,
          capability: "LOCATION_DASHBOARD_READ",
        }),
      ).not.toBeNull();
      const pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      await writer.query("BEGIN");
      const pending = writer.query(fence, [actor.organizationId]);
      await blocked(pid);
      await reader.query("COMMIT");
      await pending;
      await writer.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1",
        [actor.membershipId],
      );
      await writer.query("COMMIT");
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
      await reader.query("ROLLBACK");
      reader.release();
    }
  });
});
