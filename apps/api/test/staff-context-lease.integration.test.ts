import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createStaffOperationalContextQuery } from "../src/modules/staff/staff-operational-context-query";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { ShiftTestContext } from "./shift-test-context";

const context = new ShiftTestContext("pool_context_lease");
beforeAll(async () => {
  await context.setup();
  await context.runtimePool.end();
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl, {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
  });
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("operational context owns one bounded lease", () => {
  it("loads the five-query active-Shift context in one acquisition", async () => {
    const actor = await context.createFixture();
    await createStartShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: actor.userId,
      targetLocationId: actor.locationId,
    });
    const connect = vi.spyOn(context.runtimePool, "connect");
    try {
      const result = await createStaffOperationalContextQuery(
        context.runtimePool,
      )(actor.userId);
      expect(result.contexts[0]?.activeShift?.locationId).toBe(
        actor.locationId,
      );
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      connect.mockRestore();
    }
    await vi.waitFor(() =>
      expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
    );
  });

  it("releases the connection after denied authority and recovers", async () => {
    const actor = await context.createFixture();
    await createStartShiftCommandExecutor(context.runtimePool)({
      authenticatedUserId: actor.userId,
      targetLocationId: actor.locationId,
    });
    await context.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [actor.membershipId],
    );
    await expect(
      createStaffOperationalContextQuery(context.runtimePool)(actor.userId),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await vi.waitFor(() =>
      expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
    );
    expect(
      (await context.runtimePool.query("SELECT 1 AS ok")).rows[0]?.ok,
    ).toBe(1);
  });
  it("discards a query-failed connection and recovers without leaking admission", async () => {
    const actor = await context.createFixture();
    await vi.waitFor(() =>
      expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
    );
    await context.adminPool.query(
      `REVOKE SELECT ON shifts FROM "${context.runtimeRole}"`,
    );
    try {
      await expect(
        createStaffOperationalContextQuery(context.runtimePool)(actor.userId),
      ).rejects.toMatchObject({ code: "42501" });
      await vi.waitFor(() => {
        expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0);
        expect(context.runtimePool.totalCount).toBe(0);
      });
    } finally {
      await context.adminPool.query(
        `GRANT SELECT ON shifts TO "${context.runtimeRole}"`,
      );
    }
    const result = await createStaffOperationalContextQuery(
      context.runtimePool,
    )(actor.userId);
    expect(result.contexts).toHaveLength(1);
  });
});
