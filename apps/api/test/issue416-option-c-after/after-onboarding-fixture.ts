import { randomUUID } from "node:crypto";

import {
  staffInvitationHash,
  generateStaffInvitationToken,
} from "../../src/modules/management/staff-invitation-credential";
import { OptionCAfterFixture } from "./after-fixture";

const password = "W37 synthetic activation password 2026!";

export class OptionCAfterOnboardingFixture extends OptionCAfterFixture {
  private readonly originalActivationOrigin =
    process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;

  override async start() {
    process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN =
      "https://onboarding.example.test";
    try {
      await super.start();
    } catch (error) {
      this.restoreOrigin();
      throw error;
    }
  }

  override async stop() {
    try {
      await super.stop();
    } finally {
      this.restoreOrigin();
    }
  }

  private restoreOrigin() {
    if (this.originalActivationOrigin === undefined) {
      delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    } else {
      process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN =
        this.originalActivationOrigin;
    }
  }

  async onboardingAdmin() {
    const actor = await this.admin(true);
    const location = await this.addLocation(actor.membership.organizationId);
    return { ...actor, locationId: location.locationId };
  }

  newInvitation(locationId: string) {
    return {
      operationId: randomUUID(),
      email: `${randomUUID()}@example.com`,
      firstName: "Synthetic",
      lastName: "W37",
      role: "VALET_EMPLOYEE" as const,
      locationIds: [locationId],
    };
  }

  createViaHttp(
    org: string,
    bearer: string,
    command: ReturnType<OptionCAfterOnboardingFixture["newInvitation"]>,
  ) {
    return this.managementPost(
      `/v1/staff/management/organizations/${org}/staff`,
      bearer,
      command,
    );
  }

  resendViaHttp(org: string, member: string, bearer: string) {
    return this.managementPost(
      `/v1/staff/management/organizations/${org}/staff/${member}/invitations`,
      bearer,
      { operationId: randomUUID() },
    );
  }

  activateViaHttp(token: string) {
    return this.request("/v1/staff/auth/activate", {
      origin: this.allowedOrigin,
      body: { inviteToken: token, password },
    });
  }

  async pendingSnapshot(member: string) {
    const result = await this.query<{
      user_status: string;
      member_status: string;
      password_hash: string | null;
      count: string;
      consumed: string;
    }>(
      `SELECT account.status::text AS user_status,
              membership.status::text AS member_status,account.password_hash,
              (SELECT count(*)::text FROM staff_onboarding_invitations AS invitation
               WHERE invitation.membership_id=membership.id) AS count,
              (SELECT count(*)::text FROM staff_onboarding_invitations AS invitation
               WHERE invitation.membership_id=membership.id
                 AND invitation.consumed_at IS NOT NULL) AS consumed
       FROM organization_memberships AS membership
       JOIN users AS account ON account.id=membership.user_id WHERE membership.id=$1`,
      [member],
    );
    return result.rows[0];
  }
}

export const activationPassword = password;
export const forgedInvitationToken = () => generateStaffInvitationToken();
export const invitationVerifier = (token: string) => staffInvitationHash(token);
export const invitationToken = (link: string) =>
  new URLSearchParams(new URL(link).hash.slice(1)).get("invite")!;
