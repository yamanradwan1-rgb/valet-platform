import { expect } from "vitest";

import { staffRolePath } from "../issue416-option-c-t5/probe-fixture";
import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

export async function assertReciprocalAdminRoleMutationSerializes(
  fixture: OptionCAfterProtectedFixture,
) {
  const first = await fixture.onboardingAdmin();
  const secondUser = await fixture.createUser();
  const secondMembershipId = await fixture.addMembership(
    first.membership.organizationId,
    secondUser.id,
    "ORG_ADMIN",
  );
  const secondAuth = await fixture.nativeLogin(secondUser);
  await fixture.enrollAndAssure(secondAuth);

  // Keep a third usable Admin so either reciprocal demotion is independently
  // valid. The regression is about lock order, not LAST_USABLE_ADMIN_REQUIRED.
  const thirdUser = await fixture.createUser();
  await fixture.addMembership(
    first.membership.organizationId,
    thirdUser.id,
    "ORG_ADMIN",
  );
  const thirdAuth = await fixture.nativeLogin(thirdUser);
  await fixture.enrollAndAssure(thirdAuth);

  const [firstDemotesSecond, secondDemotesFirst] = await Promise.all([
    fixture.managementPost(
      staffRolePath(first.membership.organizationId, secondMembershipId),
      first.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    ),
    fixture.managementPost(
      staffRolePath(
        first.membership.organizationId,
        first.membership.membershipId,
      ),
      secondAuth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    ),
  ]);
  const statuses = [firstDemotesSecond.status, secondDemotesFirst.status];
  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.every((status) => [201, 401, 404].includes(status))).toBe(
    true,
  );

  const state = await fixture.query<{ id: string; role: string; version: number }>(
    `SELECT id::text,role::text,version
       FROM organization_memberships
      WHERE id=ANY($1::uuid[])
      ORDER BY id`,
    [[first.membership.membershipId, secondMembershipId]],
  );
  expect(state.rows.filter((row) => row.role === "VALET_SUPERVISOR")).toHaveLength(
    1,
  );
  expect(state.rows.filter((row) => row.role === "ORG_ADMIN")).toHaveLength(1);
  expect(state.rows.every((row) => row.version === 1 || row.version === 2)).toBe(
    true,
  );

  const audit = await fixture.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM audit_events
      WHERE organization_id=$1
        AND entity_id=ANY($2::uuid[])
        AND event_type='STAFF_ROLE_CHANGED'`,
    [
      first.membership.organizationId,
      [first.membership.membershipId, secondMembershipId],
    ],
  );
  expect(audit.rows[0]?.count).toBe(1);
}
