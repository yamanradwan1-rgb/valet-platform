import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";

describe("Cancellation authority winner ordering on real PostgreSQL connections", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  it.each([
    "USER",
    "MEMBERSHIP",
    "GRANT",
    "SHIFT",
    "ORGANIZATION",
    "LOCATION",
  ] as const)(
    "%s revocation and cancellation serialize in both winner orders",
    async (kind) => {
      for (const cancellationFirst of [false, true]) {
        const { fixture } = await harness.fixtureWithToken();
        const { sessionId } = await harness.createSession(fixture);
        const shift = await harness.context.adminPool.query(
          "SELECT id FROM shifts WHERE membership_id=$1",
          [fixture.membershipId],
        );
        const input = {
          authenticatedUserId: fixture.userId,
          sessionId,
          expectedVersion: 1,
          expectedShiftId: shift.rows[0].id as string,
        };
        const definitions = {
          USER: [
            "UPDATE users SET status='DISABLED' WHERE id=$1",
            fixture.userId,
          ],
          MEMBERSHIP: [
            "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
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
          const barrier = cancellationSqlBarrier(
            harness.context.runtimePool,
            (query) =>
              query.includes("UPDATE valet_sessions SET state = 'CANCELLED'"),
          );
          const cancel = createCancelCheckInCommandExecutor(barrier.pool)(
            input,
          );
          await barrier.entered;
          const revoke = harness.context.adminPool.query(sql!, [selector]);
          try {
            await barrier.proveBlocked(harness.context.adminPool);
          } finally {
            barrier.release();
          }
          expect((await cancel).state).toBe("CANCELLED");
          await revoke;
          const truth = await harness.context.adminPool.query(
            "SELECT state,version,(SELECT count(*)::int FROM audit_events WHERE valet_session_id=$1) AS audits FROM valet_sessions WHERE id=$1",
            [sessionId],
          );
          expect(truth.rows[0]).toEqual({
            state: "CANCELLED",
            version: 2,
            audits: 1,
          });
          await expect(
            createCancelCheckInCommandExecutor(harness.context.runtimePool)(
              input,
            ),
          ).rejects.toHaveProperty("code");
          continue;
        }
        const barrier = cancellationSqlBarrier(
          harness.context.adminPool,
          (query) => query === sql,
        );
        const authority = await barrier.pool.connect();
        await authority.query("BEGIN");
        const write = authority.query(sql!, [selector]);
        await barrier.entered;
        const cancel = createCancelCheckInCommandExecutor(
          harness.context.runtimePool,
        )(input).catch((error) => error);
        try {
          await barrier.proveBlocked(harness.context.adminPool);
        } finally {
          barrier.release();
          await write;
          await authority.query("COMMIT");
          authority.release();
        }
        expect(await cancel).toHaveProperty("code");
        const row = await harness.context.adminPool.query(
          "SELECT state,version,(SELECT count(*)::int FROM audit_events WHERE valet_session_id=$1) AS audits FROM valet_sessions WHERE id=$1",
          [sessionId],
        );
        expect(row.rows[0]).toEqual({
          state: "CHECKING_IN",
          version: 1,
          audits: 0,
        });
      }
    },
  );
});
