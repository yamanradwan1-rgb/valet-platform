import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const fixture = new StaffMfaTestFixture();
const statePath = "/v1/staff/auth/mfa/state";
const mutationCases = [
  { path: "/v1/staff/auth/mfa/enrollment/begin", body: undefined },
  {
    path: "/v1/staff/auth/mfa/enrollment/confirm",
    body: { factorId: "11111111-1111-4111-8111-111111111111", code: "123456" },
  },
  { path: "/v1/staff/auth/mfa/step-up", body: { code: "123456" } },
  {
    path: "/v1/staff/auth/mfa/recovery/begin",
    body: { recoveryCode: `vmr1-${"a".repeat(11)}-${"b".repeat(27)}` },
  },
  {
    path: "/v1/staff/auth/mfa/recovery-codes/reissue",
    body: { code: "123456" },
  },
] as const;

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

type TenantRole =
  | "ORG_ADMIN"
  | "LOCATION_MANAGER"
  | "VALET_SUPERVISOR"
  | "VALET_EMPLOYEE";

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
      expect((await fixture.getMfa(statePath, auth.accessToken)).status).toBe(200);
    }
  });

  it("rejects LM, Supervisor, Employee, inactive CA and inactive Organization", async () => {
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ] as const) {
      const user = await fixture.createUser();
      await addMembership(user.id, role);
      const auth = await fixture.nativeLogin(user);
      await expectUnavailable(await fixture.getMfa(statePath, auth.accessToken));
    }

    const inactiveMembership = await fixture.createUser();
    await addMembership(inactiveMembership.id, "ORG_ADMIN", {
      membershipStatus: "INACTIVE",
    });
    const inactiveMembershipAuth = await fixture.nativeLogin(inactiveMembership);
    await expectUnavailable(
      await fixture.getMfa(statePath, inactiveMembershipAuth.accessToken),
    );

    const inactiveOrganization = await fixture.createUser();
    await addMembership(inactiveOrganization.id, "ORG_ADMIN", {
      organizationStatus: "INACTIVE",
    });
    const inactiveOrganizationAuth = await fixture.nativeLogin(inactiveOrganization);
    await expectUnavailable(
      await fixture.getMfa(statePath, inactiveOrganizationAuth.accessToken),
    );
  });

  it("re-authorizes LM-only accounts on every MFA endpoint", async () => {
    const manager = await fixture.createUser();
    await addMembership(manager.id, "LOCATION_MANAGER");
    const auth = await fixture.nativeLogin(manager);

    await expectUnavailable(await fixture.getMfa(statePath, auth.accessToken));
    for (const operation of mutationCases) {
      await expectUnavailable(
        await fixture.postMfa(operation.path, auth.accessToken, operation.body),
      );
    }
  });

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
