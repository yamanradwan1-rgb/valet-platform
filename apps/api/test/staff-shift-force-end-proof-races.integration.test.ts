import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { StaffShiftForceEndService } from "../src/modules/management/staff-shift-force-end.service";
import {
  StaffShiftForceEndTestFixture,
  type ForceEndScenario,
} from "./staff-shift-force-end-test-fixture";
import {
  holdForceEndTestCommit,
  waitForceEndTestBlocked,
} from "./staff-shift-force-end-race-fixture";

const fixture = new StaffShiftForceEndTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);
type Loss = "grant" | "session" | "factor";

async function invalidate(client: Client, s: ForceEndScenario, loss: Loss) {
  if (loss === "grant") {
    // Same serialization boundary as the existing migration-050 grant writer.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))",
      [s.organizationId],
    );
    await client.query(
      "SELECT id FROM organization_memberships WHERE id=$1 FOR UPDATE",
      [s.actorMembershipId],
    );
    await client.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [s.actorMembershipId, s.locationId],
    );
  } else if (loss === "session") {
    await client.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [s.auth.sessionId],
    );
  } else {
    await client.query(
      "UPDATE user_mfa_totp_factors SET state='RETIRED',retired_at=clock_timestamp() WHERE id=$1",
      [s.factor!.factorId],
    );
  }
}

describe("T05-F exact session, factor and grant proof held through closure", () => {
  for (const loss of ["grant", "session", "factor"] as const) {
    it.each([false, true])(
      `${loss} loss first, rollback=%s`,
      async (rollback) => {
        const s = await fixture.scenario("LOCATION_MANAGER");
        const client = new Client({
          connectionString: fixture.migrationDatabaseUrl(),
        });
        let force: ReturnType<typeof fixture.force> | undefined;
        await client.connect();
        try {
          await client.query("BEGIN");
          await invalidate(client, s, loss);
          force = fixture.force(s);
          await waitForceEndTestBlocked(fixture);
          await client.query(rollback ? "ROLLBACK" : "COMMIT");
          const result = await force;
          expect(result.status).toBe(
            rollback
              ? 201
              : loss === "session"
                ? 401
                : loss === "factor"
                  ? 403
                  : 404,
          );
          expect(await fixture.snapshot(s.shiftId)).toMatchObject({
            status: rollback ? "ENDED" : "ACTIVE",
            closures: rollback ? 1 : 0,
            audits: rollback ? 1 : 0,
          });
        } finally {
          await client.query("ROLLBACK").catch(() => undefined);
          await force;
          await client.end();
        }
      },
      30_000,
    );

    it.each([false, true])(
      `Force End proof first vs ${loss}, rollback=%s`,
      async (rollback) => {
        const s = await fixture.scenario("LOCATION_MANAGER"),
          pool = fixture.runtimePool();
        const gate = holdForceEndTestCommit(pool, rollback);
        const client = new Client({
          connectionString: fixture.migrationDatabaseUrl(),
        });
        let force: Promise<unknown> | undefined,
          losing: Promise<void> | undefined;
        await client.connect();
        try {
          force = new StaffShiftForceEndService(gate.pool)
            .execute(s.context, s.organizationId, s.shiftId, s.command)
            .catch((error: unknown) => error);
          await gate.held;
          await client.query("BEGIN");
          losing = invalidate(client, s, loss);
          await waitForceEndTestBlocked(fixture);
          gate.release();
          await force;
          await losing;
          await client.query("COMMIT");
          expect(await fixture.snapshot(s.shiftId)).toMatchObject({
            status: rollback ? "ACTIVE" : "ENDED",
            closures: rollback ? 0 : 1,
            audits: rollback ? 0 : 1,
          });
          const denied = await fixture.force(s);
          expect(denied.status).toBe(
            loss === "session" ? 401 : loss === "factor" ? 403 : 404,
          );
        } finally {
          gate.release();
          await force;
          await losing;
          await client.query("ROLLBACK").catch(() => undefined);
          await client.end();
          await pool.end();
        }
      },
      30_000,
    );
  }
});
