import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCT5Fixture, staffDirectoryPath } from "./probe-fixture";

const fixture = new OptionCT5Fixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C S03 T5 legacy actor UUID definer → mounted tenant management", () => {
  it("cannot promote a target using a revoked admin's SQL actor UUID", async () => {
    const admin = await fixture.admin(true);
    const org = admin.membership.organizationId;
    const target = await fixture.employee(org);
    const path = staffDirectoryPath(org);
    const targetBefore = await fixture.managementGet(
      path,
      target.auth.accessToken,
    );
    expect(targetBefore).toMatchObject({
      status: 404,
      body: { code: "AUTHORIZATION_DENIED" },
    });
    expect((await fixture.logout(admin.auth.refreshToken)).status).toBe(204);
    const revoked = await fixture.managementGet(path, admin.auth.accessToken);
    expect(revoked.status).toBe(401);

    // No HTTP principal or MFA proof is sent to this SECURITY DEFINER call.
    const direct = fixture.runtimeSql(
      `SELECT changed,result_code,version
       FROM public.staff_management_set_role($1::uuid,$2::uuid,$3::uuid,1,'LOCATION_MANAGER')`,
      [admin.membership.membershipId, org, target.membershipId],
    );
    const [attempted, whileRacing] = await Promise.all([
      direct,
      fixture.managementGet(path, target.auth.accessToken),
    ]);
    const after = await fixture.managementGet(path, target.auth.accessToken);
    const member = await fixture.query<{ role: string; version: number }>(
      `SELECT role::text,version FROM organization_memberships WHERE id=$1`,
      [target.membershipId],
    );
    expect(whileRacing.status).toBe(404);
    expect(after.status).toBe(404);
    expect(member.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
    expect(attempted.allowed).toBe(false);
  });

  it("rejects foreign-tenant actor UUID and leaves both tenant roles intact", async () => {
    const adminA = await fixture.admin(true);
    const adminB = await fixture.admin(true);
    const targetB = await fixture.employee(adminB.membership.organizationId);
    const actualBearer = await fixture.managementGet(
      staffDirectoryPath(adminB.membership.organizationId),
      adminA.auth.accessToken,
    );
    expect(actualBearer.status).toBe(404);

    const attempted = await fixture.runtimeSql(
      `SELECT changed,result_code,version
       FROM public.staff_management_set_role($1::uuid,$2::uuid,$3::uuid,1,'LOCATION_MANAGER')`,
      [
        adminA.membership.membershipId,
        adminB.membership.organizationId,
        targetB.membershipId,
      ],
    );
    const member = await fixture.query<{ role: string; version: number }>(
      `SELECT role::text,version FROM organization_memberships WHERE id=$1`,
      [targetB.membershipId],
    );
    expect(member.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
    expect(attempted.allowed).toBe(false);
  });
});
