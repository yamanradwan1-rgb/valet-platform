import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ParkingCancellationTestContext } from "./cancel-before-parking-test-context";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createCancelBeforeParkingCommandExecutor } from "../src/modules/parking/cancel-before-parking-command";

describe("DEC-098 cancellation holds exact authority until commit", () => {
  const ctx = new ParkingCancellationTestContext("261_authority_races");
  beforeAll(() => ctx.setup(), 120_000);
  afterAll(() => ctx.teardown(), 60_000);
  it.each([
    "USER",
    "MEMBERSHIP",
    "ROLE",
    "GRANT",
    "SHIFT",
    "ORGANIZATION",
    "LOCATION",
  ])("%s loss serializes in both winner orders", async (kind) => {
    for (const cancellationFirst of [false, true]) {
      const { fixture, input } = await ctx.target();
      const definitions: Record<string, [string, string]> = {
        USER: [
          "UPDATE users SET status='DISABLED' WHERE id=$1",
          fixture.userId,
        ],
        MEMBERSHIP: [
          "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
          fixture.membershipId,
        ],
        ROLE: [
          "UPDATE organization_memberships SET role='ORG_ADMIN' WHERE id=$1",
          fixture.membershipId,
        ],
        GRANT: [
          "DELETE FROM membership_location_access WHERE membership_id=$1",
          fixture.membershipId,
        ],
        SHIFT: [
          "UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1",
          input.expectedShiftId,
        ],
        ORGANIZATION: [
          "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
          fixture.organizationId,
        ],
        LOCATION: [
          "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
          fixture.locationId,
        ],
      };
      const [sql, selector] = definitions[kind]!;
      if (cancellationFirst) {
        const barrier = cancellationSqlBarrier(ctx.runtimePool, (query) =>
          query.includes("UPDATE tasks"),
        );
        const cancel = createCancelBeforeParkingCommandExecutor(barrier.pool)(
          input,
        );
        await barrier.entered;
        const revoke = ctx.adminPool.query(sql, [selector]);
        try {
          await barrier.proveBlocked(ctx.adminPool);
        } finally {
          barrier.release();
        }
        expect((await cancel).state).toBe("CANCELLED");
        await revoke;
        await expect(ctx.status(input)).rejects.toHaveProperty(
          "code",
          "TASK_NOT_FOUND_OR_FORBIDDEN",
        );
      } else {
        const barrier = cancellationSqlBarrier(
          ctx.adminPool,
          (query) => query === sql,
        );
        const tx = await barrier.pool.connect();
        await tx.query("BEGIN");
        const revoke = tx.query(sql, [selector]);
        await barrier.entered;
        const cancel = ctx.cancel(input).catch((e) => e);
        try {
          await barrier.proveBlocked(ctx.adminPool);
        } finally {
          barrier.release();
          await revoke;
          await tx.query("COMMIT");
          tx.release();
        }
        expect(await cancel).toHaveProperty(
          "code",
          "TASK_NOT_FOUND_OR_FORBIDDEN",
        );
        const facts = await ctx.cancellationFacts(fixture);
        expect(facts.session.state).toBe("AWAITING_PARKING");
        expect(facts.task.status).toBe("ACCEPTED");
        expect(facts.history).toHaveLength(0);
      }
    }
  });
});
