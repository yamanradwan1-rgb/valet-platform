import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StaffShiftForceEndService } from "../src/modules/management/staff-shift-force-end.service";
import { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";
import {
  holdForceEndTestCommit,
  waitForceEndTestBlocked,
} from "./staff-shift-force-end-race-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("T05-F concurrent logical operation replay", () => {
  for (const kind of [
    "identical",
    "payload-conflict",
    "other-operation",
  ] as const) {
    it.each([false, true])(
      `${kind} competitor, rollback=%s`,
      async (rollback) => {
        const s = await fixture.scenario(),
          pool = fixture.runtimePool();
        const gate = holdForceEndTestCommit(pool, rollback);
        let first: Promise<unknown> | undefined;
        let second: ReturnType<typeof fixture.force> | undefined;
        let failed = false;
        try {
          first = gate.trackFirst(new StaffShiftForceEndService(gate.pool)
            .execute(s.context, s.organizationId, s.shiftId, s.command))
            .catch((error: unknown) => error);
          await gate.held;
          const command =
            kind === "identical"
              ? s.command
              : kind === "payload-conflict"
                ? { ...s.command, reason: "A different logical request" }
                : { ...s.command, operationId: randomUUID() };
          second = fixture.force(s, command);
          void second.catch(() => undefined);
          await waitForceEndTestBlocked(fixture, gate);
          gate.release();
          const original = await first;
          const response = await second;
          expect(response.status).toBe(
            rollback || kind === "identical" ? 201 : 409,
          );
          if (!rollback && kind === "identical")
            expect(response.body).toEqual(original);
          if (!rollback && kind !== "identical")
            expect(response.body?.code).toBe(
              kind === "payload-conflict"
                ? "IDEMPOTENCY_CONFLICT"
                : "SHIFT_ALREADY_ENDED",
            );
          expect(await fixture.snapshot(s.shiftId)).toMatchObject({
            status: "ENDED",
            closures: 1,
            audits: 1,
          });
          const audit = await fixture.query<{ reason: string }>(
            "SELECT metadata_json->>'reason' AS reason FROM audit_events WHERE entity_id=$1 AND event_type='SHIFT_FORCE_ENDED'",
            [s.shiftId],
          );
          expect(
            audit.rows[0]?.reason ===
              (rollback ? command.reason : s.command.reason),
          ).toBe(true);
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          gate.release();
          await Promise.allSettled([first, second].filter((request) => request !== undefined));
          await pool.end().catch((error: unknown) => {
            if (!failed) throw error;
          });
        }
      },
      30_000,
    );
  }
});
