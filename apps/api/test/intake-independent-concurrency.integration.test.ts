import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { useIntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";
import { addIntakeEmployee } from "./intake-concurrency-actors";
import { observeIntakeQueries } from "./intake-serialization-test-pool";

const harness = useIntakeSessionCommandTestHarness();
describe("independent same-location intakes", () => {
  it.each([
    ["TEMPORARY_DESCRIPTOR", false],
    ["TEMPORARY_DESCRIPTOR", true],
    ["CONFIRMED_PLATE", false],
  ] as const)(
    "commits eight distinct %s intakes (customer=%s) without exhausting retries",
    async (mode, withCustomer) => {
      const scope = await harness.createFixture();
      const actors = [scope.userId];
      for (let index = 1; index < 8; index += 1)
        actors.push(await addIntakeEmployee(harness, scope));
      let arrivals = 0;
      let open!: () => void;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      // Deterministic first-wave overlap after the existing-operation read,
      // without sleeps, extra writer locks or injected SQL errors.
      const pool = observeIntakeQueries(
        harness.runtimePool,
        async (sql, run) => {
          const result = await run();
          if (
            sql.includes("FROM intake_operations AS operation") &&
            arrivals < 4
          ) {
            arrivals += 1;
            if (arrivals === 4) open();
            await gate;
          }
          return result;
        },
      );
      const execute = createIntakeSessionCommandExecutor(pool);
      const results = await Promise.allSettled(
        actors.map((authenticatedUserId, index) =>
          execute(
            harness.temporaryRequest(scope, {
              authenticatedUserId,
              ...(withCustomer
                ? {
                    customer: {
                      intent: "DIFFERENT_CUSTOMER" as const,
                      phone: `+9627900000${index.toString().padStart(2, "0")}`,
                    },
                  }
                : {}),
              ...(mode === "CONFIRMED_PLATE"
                ? {
                    vehicleIdentity: {
                      mode,
                      confirmedByHuman: true,
                      plateCountry: "JO",
                      plateNumberRaw: randomUUID()
                        .replaceAll("-", "")
                        .slice(0, 16),
                    },
                  }
                : {}),
            }),
          ),
        ),
      );
      expect(results.filter((result) => result.status === "rejected")).toEqual(
        [],
      );
      expect(await harness.readCounts(scope.organizationId)).toEqual({
        audits: 8,
        customers: withCustomer ? 8 : 0,
        intakeOperations: 8,
        sessions: 8,
        vehicles: 8,
      });
      const integrity = await harness.adminPool.query<{ bad: number }>(
        `SELECT count(*)::int AS bad FROM valet_sessions s
         LEFT JOIN locations l ON l.id=s.location_id AND l.organization_id=s.organization_id
         WHERE s.organization_id=$1 AND (l.id IS NULL OR s.state <> 'CHECKING_IN'
           OR s.key_slot_id IS NOT NULL OR s.parking_spot_id IS NOT NULL)`,
        [scope.organizationId],
      );
      expect(integrity.rows[0]?.bad).toBe(0);
      expect(
        (
          await harness.adminPool.query(
            "SELECT count(*)::int AS count FROM tasks WHERE organization_id=$1",
            [scope.organizationId],
          )
        ).rows[0]?.count,
      ).toBe(0);
    },
  );
});
