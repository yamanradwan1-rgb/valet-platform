import { expect } from "vitest";

import { staffRolePath } from "../issue416-option-c-t5/probe-fixture";
import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

type OnboardingAdmin = Awaited<
  ReturnType<OptionCAfterProtectedFixture["onboardingAdmin"]>
>;
type Employee = Awaited<ReturnType<OptionCAfterProtectedFixture["employee"]>>;

const protectedRoleMutation = `SELECT * FROM public.staff_management_authorized_set_role(
  $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::integer,$8::membership_role)`;

function roleMutationArgs(
  admin: OnboardingAdmin,
  target: Employee,
  bearer = admin.auth.accessToken,
  actorMembershipId = admin.membership.membershipId,
  organizationId = admin.membership.organizationId,
) {
  return [
    admin.auth.sessionId,
    admin.user.id,
    bearer,
    actorMembershipId,
    organizationId,
    target.membershipId,
    1,
    "VALET_SUPERVISOR",
  ];
}

async function expectDenied(
  fixture: OptionCAfterProtectedFixture,
  sql: string,
  values: unknown[],
) {
  const result = await fixture.managementWriterSql(sql, values);
  expect(result.allowed).toBe(false);
  if (!result.allowed) expect(result.sqlstate).toBe("42501");
}

export async function assertInvalidDisabledForgedAndCrossCompany(
  fixture: OptionCAfterProtectedFixture,
) {
  const admin = await fixture.onboardingAdmin();
  const target = await fixture.employee(admin.membership.organizationId);
  await expectDenied(
    fixture,
    protectedRoleMutation,
    roleMutationArgs(admin, target, "not-the-current-bearer"),
  );
  await expectDenied(
    fixture,
    protectedRoleMutation,
    roleMutationArgs(
      admin,
      target,
      admin.auth.accessToken,
      target.membershipId,
    ),
  );

  const foreignAdmin = await fixture.onboardingAdmin();
  const foreignTarget = await fixture.employee(
    foreignAdmin.membership.organizationId,
  );
  await expectDenied(
    fixture,
    protectedRoleMutation,
    roleMutationArgs(
      admin,
      foreignTarget,
      admin.auth.accessToken,
      admin.membership.membershipId,
      foreignAdmin.membership.organizationId,
    ),
  );
  const foreignUnchanged = await fixture.query<{
    role: string;
    version: number;
  }>("SELECT role::text,version FROM organization_memberships WHERE id=$1", [
    foreignTarget.membershipId,
  ]);
  expect(foreignUnchanged.rows[0]).toEqual({
    role: "VALET_EMPLOYEE",
    version: 1,
  });

  await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
    admin.user.id,
  ]);
  await expectDenied(
    fixture,
    protectedRoleMutation,
    roleMutationArgs(admin, target),
  );
  const unchanged = await fixture.query<{ role: string; version: number }>(
    "SELECT role::text,version FROM organization_memberships WHERE id=$1",
    [target.membershipId],
  );
  expect(unchanged.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
}

export async function assertConcurrentActorRoleMutation(
  fixture: OptionCAfterProtectedFixture,
) {
  const admin = await fixture.onboardingAdmin();
  const secondUser = await fixture.createUser();
  const secondMembershipId = await fixture.addMembership(
    admin.membership.organizationId,
    secondUser.id,
    "ORG_ADMIN",
  );
  const secondAuth = await fixture.nativeLogin(secondUser);
  await fixture.enrollAndAssure(secondAuth);
  const target = await fixture.employee(admin.membership.organizationId);

  const [targetMutation, actorDemotion] = await Promise.all([
    fixture.managementPost(
      staffRolePath(admin.membership.organizationId, target.membershipId),
      admin.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    ),
    fixture.managementPost(
      staffRolePath(
        admin.membership.organizationId,
        admin.membership.membershipId,
      ),
      secondAuth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    ),
  ]);
  expect(actorDemotion.status).toBe(201);
  expect([201, 401, 404]).toContain(targetMutation.status);

  const actorState = await fixture.query<{ role: string; version: number }>(
    "SELECT role::text,version FROM organization_memberships WHERE id=$1",
    [admin.membership.membershipId],
  );
  expect(actorState.rows[0]).toEqual({ role: "VALET_SUPERVISOR", version: 2 });
  const targetState = await fixture.query<{ role: string; version: number }>(
    "SELECT role::text,version FROM organization_memberships WHERE id=$1",
    [target.membershipId],
  );
  const targetAudit = await fixture.query<{
    actor_membership_id: string;
  }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_id=$2 AND event_type='STAFF_ROLE_CHANGED'`,
    [admin.membership.organizationId, target.membershipId],
  );
  if (targetMutation.status === 201) {
    expect(targetState.rows[0]).toEqual({
      role: "VALET_SUPERVISOR",
      version: 2,
    });
    expect(targetAudit.rows).toEqual([
      { actor_membership_id: admin.membership.membershipId },
    ]);
  } else {
    expect(targetState.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
    expect(targetAudit.rows).toHaveLength(0);
  }
  const demotionAudit = await fixture.query<{
    actor_membership_id: string;
  }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_id=$2 AND event_type='STAFF_ROLE_CHANGED'`,
    [admin.membership.organizationId, admin.membership.membershipId],
  );
  expect(demotionAudit.rows).toEqual([
    { actor_membership_id: secondMembershipId },
  ]);
}

export async function assertConcurrentLogoutFencesMutation(
  fixture: OptionCAfterProtectedFixture,
) {
  const admin = await fixture.onboardingAdmin();
  const target = await fixture.employee(admin.membership.organizationId);
  const [mutation, logout] = await Promise.all([
    fixture.managementPost(
      staffRolePath(admin.membership.organizationId, target.membershipId),
      admin.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    ),
    fixture.logout(admin.auth.refreshToken),
  ]);
  expect(logout.status).toBe(204);
  expect([201, 401, 404]).toContain(mutation.status);

  const targetState = await fixture.query<{ role: string; version: number }>(
    "SELECT role::text,version FROM organization_memberships WHERE id=$1",
    [target.membershipId],
  );
  const audit = await fixture.query<{ actor_membership_id: string }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_id=$2 AND event_type='STAFF_ROLE_CHANGED'`,
    [admin.membership.organizationId, target.membershipId],
  );
  if (mutation.status === 201) {
    expect(targetState.rows[0]).toEqual({
      role: "VALET_SUPERVISOR",
      version: 2,
    });
    expect(audit.rows).toEqual([
      { actor_membership_id: admin.membership.membershipId },
    ]);
  } else {
    expect(targetState.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });
    expect(audit.rows).toHaveLength(0);
  }
  const session = await fixture.sessionSnapshot(admin.auth.sessionId);
  expect(session.rows[0]?.revoked_at).not.toBeNull();
}

export async function assertStatusAndLocationWrappers(
  fixture: OptionCAfterProtectedFixture,
) {
  const admin = await fixture.onboardingAdmin();
  const target = await fixture.employee(admin.membership.organizationId);
  const location = await fixture.addLocation(admin.membership.organizationId);
  const base = `/v1/staff/management/organizations/${admin.membership.organizationId}/staff/${target.membershipId}`;
  const grant = await fixture.managementPost(
    `${base}/location-access/grant`,
    admin.auth.accessToken,
    { expectedVersion: 1, locationIds: [location.locationId] },
  );
  expect(grant.status).toBe(201);
  expect(grant.body).toMatchObject({ locationAccessCount: 2, version: 2 });
  const deactivate = await fixture.managementPost(
    `${base}/deactivate`,
    admin.auth.accessToken,
    { expectedVersion: 2 },
  );
  expect(deactivate.status).toBe(201);
  expect(deactivate.body).toMatchObject({ status: "INACTIVE", version: 3 });
  const activate = await fixture.managementPost(
    `${base}/activate`,
    admin.auth.accessToken,
    { expectedVersion: 3 },
  );
  expect(activate.status).toBe(201);
  expect(activate.body).toMatchObject({ status: "ACTIVE", version: 4 });
  const revoke = await fixture.managementPost(
    `${base}/location-access/revoke`,
    admin.auth.accessToken,
    { expectedVersion: 4, locationIds: [location.locationId] },
  );
  expect(revoke.status).toBe(201);
  expect(revoke.body).toMatchObject({ locationAccessCount: 1, version: 5 });
  const grants = await fixture.query<{ location_id: string }>(
    `SELECT location_id::text FROM membership_location_access
     WHERE organization_id=$1 AND membership_id=$2`,
    [admin.membership.organizationId, target.membershipId],
  );
  expect(grants.rows).toEqual([{ location_id: target.location.locationId }]);
  const audit = await fixture.query<{ actor_membership_id: string }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_id=$2
       AND event_type IN ('STAFF_LOCATION_ACCESS_GRANTED',
         'STAFF_MEMBERSHIP_DEACTIVATED','STAFF_MEMBERSHIP_ACTIVATED',
         'STAFF_LOCATION_ACCESS_REVOKED')`,
    [admin.membership.organizationId, target.membershipId],
  );
  expect(audit.rows).toHaveLength(4);
  expect(audit.rows.map((row) => row.actor_membership_id)).toEqual(
    Array(4).fill(admin.membership.membershipId),
  );
}
