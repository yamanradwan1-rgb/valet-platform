import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { authorizeStaffPaymentProjection } from "../src/modules/payments/payment-projection-authorization";
import { FinancialAlertTestContext } from "./issue414-financial-alert-fixture";

const db = new FinancialAlertTestContext("authorization");
let seeded: Awaited<ReturnType<typeof db.seedUnresolved>>;

beforeAll(async () => {
  await db.setup();
  await db.managerFixture();
  seeded = await db.seedUnresolved("OUTCOME_UNKNOWN", 300);
}, 120_000);
afterAll(() => db.teardown(), 120_000);

describe("DEC-111 precise financial alert source authority", () => {
  it("requires the same exact persisted LM Payment authority, active Location grant and Staff session", async () => {
    const fixture = await db.managerFixture();
    const input = await db.managerReaderInput();
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        authorizeStaffPaymentProjection(tx, fixture.userId, seeded.sessionId),
      ),
    ).toMatchObject({
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      valetSessionId: seeded.sessionId,
    });
    expect(await db.exact(input, seeded, "ALT-11")).toMatchObject({
      category: "ALT-11",
      episodeId: seeded.operationId,
    });

    const ungranted = await db.createActor(fixture, "LOCATION_MANAGER", {
      access: false,
    });
    const denied = {
      ...input,
      context: await db.staffSessionContext(ungranted.userId),
      scope: { ...input.scope, membershipId: ungranted.membershipId },
    };
    await expect(db.exact(denied, seeded, "ALT-11")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        authorizeStaffPaymentProjection(tx, ungranted.userId, seeded.sessionId),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await db.grantAccess(fixture, ungranted.membershipId);
    expect(await db.exact(denied, seeded, "ALT-11")).toMatchObject({
      episodeId: seeded.operationId,
    });
    expect(
      await inPostgresTransaction(db.runtimePool, (tx) =>
        authorizeStaffPaymentProjection(tx, ungranted.userId, seeded.sessionId),
      ),
    ).toMatchObject({ valetSessionId: seeded.sessionId });
    await db.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [fixture.organizationId, ungranted.membershipId, fixture.locationId],
    );
    await expect(db.exact(denied, seeded, "ALT-11")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        authorizeStaffPaymentProjection(tx, ungranted.userId, seeded.sessionId),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a different active Location, cross-tenant scope and operational Supervisor", async () => {
    const fixture = await db.managerFixture();
    const input = await db.managerReaderInput();
    const otherLocation = await db.addLocation(fixture, { access: false });
    await expect(
      db.list({
        ...input,
        scope: { ...input.scope, locationId: otherLocation },
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const otherOrganization = await db.createFixture({
      role: "LOCATION_MANAGER",
    });
    await expect(
      db.list({
        ...input,
        scope: {
          organizationId: otherOrganization.organizationId,
          locationId: otherOrganization.locationId,
          membershipId: otherOrganization.membershipId,
        },
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const supervisor = await db.createActor(fixture, "VALET_SUPERVISOR");
    await db.startActiveShift(fixture, supervisor);
    const supervisorInput = {
      ...input,
      context: await db.staffSessionContext(supervisor.userId),
      scope: { ...input.scope, membershipId: supervisor.membershipId },
    };
    await expect(
      db.exact(supervisorInput, seeded, "ALT-11"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects a rotated/revoked Staff credential before source access", async () => {
    const input = await db.managerReaderInput();
    expect(await db.exact(input, seeded, "ALT-11")).not.toBeNull();
    await db.adminPool.query(
      "UPDATE staff_auth_sessions SET current_access_token_hash=$2 WHERE id=$1",
      [
        input.context.staffAuthSessionId,
        `staff-access-sha256:v1:${randomBytes(32).toString("hex")}`,
      ],
    );
    await expect(db.exact(input, seeded, "ALT-11")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });

  it("permits only protected CA MFA and does not renew admin activity while reading", async () => {
    const fixture = await db.managerFixture();
    const admin = await db.createActor(fixture, "ORG_ADMIN", { access: false });
    const input = await db.managerReaderInput();
    const scope = { ...input.scope, membershipId: admin.membershipId };
    const context = await db.staffSessionContext(admin.userId);
    await expect(
      db.exact({ ...input, context, scope }, seeded, "ALT-11"),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    const factorId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO user_mfa_totp_factors
         (id,user_id,state,protected_secret,last_accepted_step,
          recovery_set_generation,activated_at)
       VALUES($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
      [
        factorId,
        admin.userId,
        `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`,
      ],
    );
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
       mfa_authenticated_at=clock_timestamp(), last_admin_activity_at=clock_timestamp()
       WHERE id=$1`,
      [context.staffAuthSessionId, factorId],
    );
    const activity = await db.adminPool.query<{ last_admin_activity_at: Date }>(
      "SELECT last_admin_activity_at FROM staff_auth_sessions WHERE id=$1",
      [context.staffAuthSessionId],
    );
    const current = { ...input, context, scope };
    expect(await db.exact(current, seeded, "ALT-11")).toMatchObject({
      episodeId: seeded.operationId,
    });
    await db.list(current);
    const after = await db.adminPool.query<{ last_admin_activity_at: Date }>(
      "SELECT last_admin_activity_at FROM staff_auth_sessions WHERE id=$1",
      [context.staffAuthSessionId],
    );
    expect(after.rows[0]?.last_admin_activity_at).toEqual(
      activity.rows[0]?.last_admin_activity_at,
    );
  });

  it("denies disabled commercial entitlement and preserves Payment and provider event rows on read", async () => {
    const fixture = await db.managerFixture();
    const input = await db.managerReaderInput();
    const before = await db.adminPool.query(
      `SELECT payment.status, payment.updated_at,
           operation.state, operation.updated_at AS operation_updated_at
       FROM payments AS payment
       JOIN payment_collection_operations AS operation
         ON operation.payment_id=payment.id
       WHERE payment.id=$1`,
      [seeded.paymentId],
    );
    await db.list(input);
    await db.exact(input, seeded, "ALT-11");
    const after = await db.adminPool.query(
      `SELECT payment.status, payment.updated_at,
           operation.state, operation.updated_at AS operation_updated_at
       FROM payments AS payment
       JOIN payment_collection_operations AS operation
         ON operation.payment_id=payment.id
       WHERE payment.id=$1`,
      [seeded.paymentId],
    );
    expect(after.rows).toEqual(before.rows);
    await db.adminPool.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
      [fixture.organizationId],
    );
    try {
      await expect(db.list(input)).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
      await expect(db.exact(input, seeded, "ALT-11")).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    } finally {
      await db.adminPool.query(
        "UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1",
        [fixture.organizationId],
      );
    }
  });
});
