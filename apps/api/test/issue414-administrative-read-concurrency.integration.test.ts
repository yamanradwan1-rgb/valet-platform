import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { queryForcedShiftEndOccurrences } from "../src/modules/dashboard/management-alert-sources/force-ended-shift-occurrence-reader";
import { queryStaffSecurityOccurrences } from "../src/modules/dashboard/management-alert-sources/staff-security-occurrence-reader";
import {
  StaffShiftForceEndTestFixture,
  type ForceEndScenario,
} from "./staff-shift-force-end-test-fixture";

const fixture = new StaffShiftForceEndTestFixture();
let pool: Pool;
let scenario: ForceEndScenario;
let context: StaffSessionContext;

beforeAll(async () => {
  await fixture.start();
  pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 4 });
  scenario = await fixture.scenario("ORG_ADMIN");
  const session = await fixture.query<{ createdAt: Date }>(
    `SELECT created_at AS "createdAt" FROM staff_auth_sessions WHERE id=$1`,
    [scenario.auth.sessionId],
  );
  context = { ...scenario.context, createdAt: session.rows[0]!.createdAt };
  expect((await fixture.force(scenario)).status).toBe(201);
  const staffRoute = `/v1/staff/management/organizations/${scenario.organizationId}/staff/${scenario.membershipId}/role`;
  expect(
    (
      await fixture.managementPost(staffRoute, scenario.auth.accessToken, {
        expectedVersion: 1,
        role: "VALET_SUPERVISOR",
      })
    ).status,
  ).toBe(201);
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
  await fixture.stop();
}, 60_000);

const shiftInput = () => ({
  context,
  organizationId: scenario.organizationId,
  locationId: scenario.locationId,
  limit: 21,
});
const staffInput = () => ({
  context,
  organizationId: scenario.organizationId,
  limit: 21,
});

describe("Issue #414 F shared read fence: real PostgreSQL only", () => {
  it("permits two concurrent same-session SHARED reads but refuses lock upgrade", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      // PostgreSQL disallows SELECT ... FOR SHARE under BEGIN READ ONLY.
      // These are ordinary transactions that execute NO DML.
      await first.query("BEGIN");
      await second.query("BEGIN");
      await second.query("SET LOCAL lock_timeout = '3000ms'");
      expect(
        await queryForcedShiftEndOccurrences(first, shiftInput()),
      ).toHaveLength(1);
      // A stale exclusive session/org lock would block this until lock_timeout.
      expect(
        await queryForcedShiftEndOccurrences(second, shiftInput()),
      ).toHaveLength(1);
      const lock = await second.query<{ exclusive: boolean; shared: boolean }>(
        `SELECT pg_try_advisory_xact_lock(
             hashtextextended('staff-management-org:' || $1::text, 0)
           ) AS "exclusive",
           pg_try_advisory_xact_lock_shared(
             hashtextextended('staff-management-org:' || $1::text, 0)
           ) AS "shared"`,
        [scenario.organizationId],
      );
      expect(lock.rows[0]).toMatchObject({ exclusive: false, shared: true });
    } finally {
      await Promise.allSettled([
        first.query("ROLLBACK"),
        second.query("ROLLBACK"),
      ]);
      first.release();
      second.release();
    }
  }, 30_000);

  it.each([25, 100, 200])(
    "profiles %i simulated foreground tabs at two 60s-apart waves (pool=4)",
    async (tabCount) => {
      const runWave = async () => {
        const latencyMs: number[] = [];
        const results = await Promise.all(
          Array.from({ length: tabCount }, async () => {
            const started = performance.now();
            const result = await inPostgresTransaction(
              pool,
              async (transaction) => {
                const shift = await queryForcedShiftEndOccurrences(
                  transaction,
                  shiftInput(),
                );
                const staff = await queryStaffSecurityOccurrences(
                  transaction,
                  staffInput(),
                );
                return { shift, staff };
              },
            );
            latencyMs.push(performance.now() - started);
            return result;
          }),
        );
        expect(
          results.every(
            (result) =>
              result.shift.length === 1 &&
              result.shift[0]?.targetId === scenario.shiftId &&
              result.staff.length === 1 &&
              result.staff[0]?.targetId === scenario.membershipId,
          ),
        ).toBe(true);
        return latencyMs;
      };
      const began = performance.now();
      const first = await runWave();
      // This is a DB-backed simulated-tab profile, NOT real HTTP/browser p95.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, 60_000 - (performance.now() - began)));
      });
      const second = await runWave();
      const elapsed = [...first, ...second].sort((a, b) => a - b);
      const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1]!;
      const max = elapsed[elapsed.length - 1]!;
      console.info(
        JSON.stringify({
          profile: "issue414-f-pg-source-simulated-tabs",
          tabCount,
          samples: elapsed.length,
          poolMax: 4,
          p95Ms: Number(p95.toFixed(1)),
          maxMs: Number(max.toFixed(1)),
        }),
      );
      // Quantitative SLO is reviewed against real measured evidence; do not
      // fabricate an accepted pass threshold or conflate this with HTTP.
    },
    150_000,
  );
});
