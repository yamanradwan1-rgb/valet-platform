import { expect } from "vitest";

import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

export async function assertOnboardingWrappersAndAudit(
  fixture: OptionCAfterProtectedFixture,
) {
  const admin = await fixture.onboardingAdmin();
  const command = fixture.newInvitation(admin.locationId);
  const created = await fixture.createViaHttp(
    admin.membership.organizationId,
    admin.auth.accessToken,
    command,
  );
  expect(created.status).toBe(201);
  expect(created.body?.outcome).toBe("INVITE_ISSUED");
  const membershipId = String(created.body?.membershipId);
  const resent = await fixture.resendViaHttp(
    admin.membership.organizationId,
    membershipId,
    admin.auth.accessToken,
  );
  expect(resent.status).toBe(201);
  expect(resent.body?.outcome).toBe("INVITE_ISSUED");
  expect(await fixture.pendingSnapshot(membershipId)).toMatchObject({
    user_status: "PENDING",
    member_status: "PENDING",
    count: "2",
    consumed: "0",
  });
  const issuers = await fixture.query<{
    issued_by_membership_id: string;
  }>(
    `SELECT issued_by_membership_id::text FROM staff_onboarding_invitations
     WHERE membership_id=$1 ORDER BY generation`,
    [membershipId],
  );
  expect(issuers.rows).toEqual([
    { issued_by_membership_id: admin.membership.membershipId },
    { issued_by_membership_id: admin.membership.membershipId },
  ]);
  const audit = await fixture.query<{ actor_membership_id: string }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_type='OrganizationMembership'
       AND entity_id=$2 AND event_type IN (
         'STAFF_ONBOARDING_INVITATION_ISSUED',
         'STAFF_ONBOARDING_INVITATION_RESENT') ORDER BY occurred_at`,
    [admin.membership.organizationId, membershipId],
  );
  expect(audit.rows).toEqual([
    { actor_membership_id: admin.membership.membershipId },
    { actor_membership_id: admin.membership.membershipId },
  ]);
}
