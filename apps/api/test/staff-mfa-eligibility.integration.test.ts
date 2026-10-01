import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();
const statePath = "/v1/staff/auth/mfa/state";

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

type TenantRole =
  "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE";

async function addMembership(
  userId: string,
  role: TenantRole,
  options: {
    readonly membershipStatus?: "ACTIVE" | "INACTIVE";
    readonly organizationStatus?: "ACTIVE" | "INACTIVE";
  } = {},
) {
  const organizationId = randomUUID();
  await fixture.query(
    `INSERT INTO organizations
       (id, name, status, timezone, updated_at)
     VALUES ($1, $2, $3, 'Asia/Amman', transaction_timestamp())`,
    [
      organizationId,
      `MFA eligibility ${organizationId}`,
      options.organizationStatus ?? "ACTIVE",
    ],
  );
  await fixture.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
    [
      randomUUID(),
      organizationId,
      userId,
      role,
      options.membershipStatus ?? "ACTIVE",
    ],
  );
}

async function expectUnavailable(response: { status: number; body: unknown }) {
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ code: "MFA_ENROLLMENT_NOT_AVAILABLE" });
}

describe("MFA account eligibility", () => {
  it("keeps eligibility account-level across mixed active memberships", async () => {
    for (const extraRole of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "ORG_ADMIN",
    ] as const) {
      const admin = await fixture.createCompanyAdmin();
      await addMembership(admin.userId, extraRole);
      const auth = await fixture.nativeLogin(admin);
      expect((await fixture.getMfa(statePath, auth.accessToken)).status).toBe(
        200,
      );
    }
  }, 15_000);

  it("rejects Supervisor, Employee, inactive membership and inactive Organization", async () => {
    for (const role of ["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const) {
      const user = await fixture.createUser();
      await addMembership(user.id, role);
      const auth = await fixture.nativeLogin(user);
      await expectUnavailable(
        await fixture.getMfa(statePath, auth.accessToken),
      );
    }

    const inactiveMembership = await fixture.createUser();
    await addMembership(inactiveMembership.id, "ORG_ADMIN", {
      membershipStatus: "INACTIVE",
    });
    const inactiveMembershipAuth =
      await fixture.nativeLogin(inactiveMembership);
    await expectUnavailable(
      await fixture.getMfa(statePath, inactiveMembershipAuth.accessToken),
    );

    const inactiveOrganization = await fixture.createUser();
    await addMembership(inactiveOrganization.id, "ORG_ADMIN", {
      organizationStatus: "INACTIVE",
    });
    const inactiveOrganizationAuth =
      await fixture.nativeLogin(inactiveOrganization);
    await expectUnavailable(
      await fixture.getMfa(statePath, inactiveOrganizationAuth.accessToken),
    );

    const inactiveManager = await fixture.createUser();
    await addMembership(inactiveManager.id, "LOCATION_MANAGER", {
      membershipStatus: "INACTIVE",
    });
    const inactiveManagerAuth = await fixture.nativeLogin(inactiveManager);
    await expectUnavailable(
      await fixture.getMfa(statePath, inactiveManagerAuth.accessToken),
    );
  }, 15_000);

  it("allows an active LM-only account to use the existing MFA ceremony", async () => {
    const manager = await fixture.createUser();
    await addMembership(manager.id, "LOCATION_MANAGER");
    const auth = await fixture.nativeLogin(manager);

    const state = await fixture.getMfa(statePath, auth.accessToken);
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ state: "ENROLLMENT_REQUIRED" });
    const begun = await fixture.postMfa(
      "/v1/staff/auth/mfa/enrollment/begin",
      auth.accessToken,
    );
    expect(begun.status).toBe(200);
    expect(begun.body).toMatchObject({ factorId: expect.any(String) });
  }, 15_000);

  it("denies disabled Staff before Account Security can be used", async () => {
    const admin = await fixture.createCompanyAdmin();
    await fixture.query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [
      admin.userId,
    ]);
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: admin.email, password: admin.password },
    });
    expect(login.status).not.toBe(200);
  });
});
