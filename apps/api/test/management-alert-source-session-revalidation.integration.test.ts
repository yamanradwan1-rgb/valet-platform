import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findIncidentAlertCaseById,
  queryIncidentAlertCases,
} from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext("414-alert-session-revalidation");
let incidentId: string;

beforeAll(async () => {
  await db.setup();
  await db.managerFixture();
  const valetSessionId = await db.seedSession({ state: "PARKED" });
  incidentId = await db.seedIncident({
    sessionId: valetSessionId,
    status: "OPEN",
  });
}, 120_000);
afterAll(() => db.teardown(), 120_000);

describe("Issue #414 source readers reject obsolete Location Manager sessions", () => {
  it.each(["rotated", "expired", "revoked"] as const)(
    "fails closed on %s access token despite an unchanged current LM grant",
    async (scenario) => {
      const fixture = await db.managerFixture();
      const context = await db.staffSessionContext(fixture.userId);
      const scope = {
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        membershipId: fixture.membershipId,
      };
      const list = () =>
        inPostgresTransaction(db.runtimePool, (transaction) =>
          queryIncidentAlertCases(transaction, { context, scope, limit: 21 }),
        );
      const exact = () =>
        inPostgresTransaction(db.runtimePool, (transaction) =>
          findIncidentAlertCaseById(transaction, {
            context,
            scope,
            sourceId: incidentId,
          }),
        );

      // This is an actual entitled Location Manager and a real current source.
      expect((await list()).map((item) => item.sourceId)).toContain(incidentId);
      expect(await exact()).toMatchObject({ sourceId: incidentId });

      if (scenario === "rotated") {
        await db.adminPool.query(
          "UPDATE staff_auth_sessions SET current_access_token_hash=$2 WHERE id=$1",
          [
            context.staffAuthSessionId,
            `staff-access-sha256:v1:${randomBytes(32).toString("hex")}`,
          ],
        );
      } else if (scenario === "expired") {
        await db.adminPool.query(
          "UPDATE staff_auth_sessions SET access_expires_at=created_at+interval '1 millisecond' WHERE id=$1",
          [context.staffAuthSessionId],
        );
      } else {
        await db.adminPool.query(
          "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
          [context.staffAuthSessionId],
        );
      }

      // The Location grant remains valid; only this Staff credential went stale.
      const grant = await db.adminPool.query(
        `SELECT 1 FROM membership_location_access
         WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
        [fixture.organizationId, fixture.membershipId, fixture.locationId],
      );
      expect(grant.rowCount).toBe(1);
      await expect(list()).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
      await expect(exact()).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });

      // A newly issued current token for the same still-entitled LM succeeds.
      const fresh = await db.staffSessionContext(fixture.userId);
      const healthy = await inPostgresTransaction(
        db.runtimePool,
        (transaction) =>
          queryIncidentAlertCases(transaction, {
            context: fresh,
            scope,
            limit: 21,
          }),
      );
      expect(healthy.map((item) => item.sourceId)).toContain(incidentId);
    },
  );

  it("requires a current Company Admin MFA assurance and denies expired assurance", async () => {
    const fixture = await db.managerFixture();
    const admin = await db.createActor(fixture, "ORG_ADMIN", { access: false });
    const factorId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO user_mfa_totp_factors
         (id,user_id,state,protected_secret,last_accepted_step,recovery_set_generation,activated_at)
       VALUES($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
      [
        factorId,
        admin.userId,
        `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`,
      ],
    );
    const context = await db.staffSessionContext(admin.userId);
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
         mfa_authenticated_at=clock_timestamp(),last_admin_activity_at=clock_timestamp()
       WHERE id=$1`,
      [context.staffAuthSessionId, factorId],
    );
    const scope = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      membershipId: admin.membershipId,
    };
    const currentCases = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryIncidentAlertCases(tx, { context, scope, limit: 21 }),
    );
    expect(currentCases.map((item) => item.sourceId)).toContain(incidentId);
    const aged = await db.adminPool.query<{ created_at: Date }>(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '9 hours',
           last_rotated_at=clock_timestamp()-interval '9 hours',
           mfa_authenticated_at=clock_timestamp()-interval '8 hours 1 minute',
           last_admin_activity_at=clock_timestamp()-interval '8 hours'
       WHERE id=$1 RETURNING created_at`,
      [context.staffAuthSessionId],
    );
    // The resolver would return the updated persisted creation timestamp.
    const expiredContext = {
      ...context,
      createdAt: aged.rows[0]!.created_at,
    };
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryIncidentAlertCases(tx, {
          context: expiredContext,
          scope,
          limit: 21,
        }),
      ),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
