import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import {
  authorizeManagementAuditLocation,
  authorizeManagementAuditOrganization,
} from "../src/modules/management/management-audit-authorization";
import type { MfaAuthSession } from "./staff-mfa-test-fixture";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function context(
  auth: MfaAuthSession,
  userId: string,
): Promise<StaffSessionContext> {
  const session = await fixture.query<{ readonly created_at: Date }>(
    `SELECT created_at FROM staff_auth_sessions WHERE id = $1`,
    [auth.sessionId],
  );
  const createdAt = session.rows[0]?.created_at;
  if (createdAt === undefined) throw new Error("Test Staff session missing.");
  return {
    accessTokenHash: staffCredentialHash("access", auth.accessToken),
    createdAt,
    staffAuthSessionId: auth.sessionId,
    userId,
  };
}

async function inTransaction<T>(
  operation: (transaction: PoolClient) => Promise<T>,
): Promise<T> {
  const transaction = await fixture.databasePool().connect();
  try {
    await transaction.query("BEGIN");
    return await operation(transaction);
  } finally {
    await transaction.query("ROLLBACK");
    transaction.release();
  }
}

describe("MGT-BE-06 Management audit authorization", () => {
  it("requires exact-session STANDARD MFA for Company Admin and allows inactive historical Locations", async () => {
    const admin = await fixture.createCompanyAdmin();
    await fixture.query(
      `INSERT INTO organization_subscriptions
         (organization_id, plan_code, status, dashboard_access_enabled,
          report_exports_enabled, basic_branding_enabled)
       VALUES ($1, 'TEST_ENTITLED', 'ACTIVE', TRUE, TRUE, TRUE)`,
      [admin.organizationId],
    );
    const inactive = await fixture.addLocation(admin.organizationId, {
      status: "INACTIVE",
    });
    const auth = await fixture.nativeLogin(admin);
    const actor = await context(auth, admin.userId);

    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditOrganization(
          transaction,
          actor,
          admin.organizationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    await fixture.enrollAndAssure(auth);
    const organization = await inTransaction((transaction) =>
      authorizeManagementAuditOrganization(
        transaction,
        actor,
        admin.organizationId,
      ),
    );
    expect(organization).toMatchObject({
      locationId: null,
      organizationId: admin.organizationId,
      role: "ORG_ADMIN",
      scope: "ORGANIZATION",
    });

    const location = await inTransaction((transaction) =>
      authorizeManagementAuditLocation(
        transaction,
        actor,
        admin.organizationId,
        inactive.locationId,
      ),
    );
    expect(location).toMatchObject({
      locationId: inactive.locationId,
      organizationId: admin.organizationId,
      role: "ORG_ADMIN",
      scope: "LOCATION",
    });
  });

  it("limits Location Manager to an explicit exact-Location grant, including inactive history", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "LOCATION_MANAGER",
    );
    const granted = await fixture.addLocation(organizationId, {
      status: "INACTIVE",
    });
    const ungranted = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      granted.locationId,
    );
    const auth = await fixture.nativeLogin(user);
    const actor = await context(auth, user.id);

    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditOrganization(
          transaction,
          actor,
          organizationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          ungranted.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          granted.locationId,
        ),
      ),
    ).resolves.toMatchObject({
      locationId: granted.locationId,
      membershipId,
      role: "LOCATION_MANAGER",
      scope: "LOCATION",
    });
  });

  it("requires Supervisor grant, active Location, and active exact-Location Shift", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "VALET_SUPERVISOR",
    );
    const active = await fixture.addLocation(organizationId);
    const inactive = await fixture.addLocation(organizationId, {
      status: "INACTIVE",
    });
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      active.locationId,
    );
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      inactive.locationId,
    );
    const auth = await fixture.nativeLogin(user);
    const actor = await context(auth, user.id);

    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          active.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const shiftId = await fixture.startActiveShift(
      organizationId,
      active.locationId,
      membershipId,
    );
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          active.locationId,
        ),
      ),
    ).resolves.toMatchObject({ role: "VALET_SUPERVISOR", scope: "LOCATION" });
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          inactive.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.endShift(shiftId);
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          active.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies Employee and current-session revocation", async () => {
    const employee = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      employee.id,
      "VALET_EMPLOYEE",
    );
    const location = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      location.locationId,
    );
    const auth = await fixture.nativeLogin(employee);
    const actor = await context(auth, employee.id);
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          location.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.query(
      `UPDATE organization_memberships
       SET role = 'LOCATION_MANAGER'
       WHERE id = $1`,
      [membershipId],
    );
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET revoked_at = clock_timestamp()
       WHERE id = $1`,
      [auth.sessionId],
    );
    await expect(
      inTransaction((transaction) =>
        authorizeManagementAuditLocation(
          transaction,
          actor,
          organizationId,
          location.locationId,
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
