import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffOnboardingCreate,
  StaffOnboardingResend,
  StaffOnboardingResult,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeStaffManagement } from "./staff-management-authorization";
import {
  generateStaffInvitationToken,
  staffInvitationHash,
} from "./staff-invitation-credential";
import {
  lockStaffOnboardingAccount,
  staffOnboardingTargetEmail,
} from "./staff-onboarding-account-lock";
import {
  staffActivationLink,
  staffOnboardingCreateFingerprint,
  staffOnboardingResendFingerprint,
} from "./staff-onboarding-policy";
import {
  createStaffOnboarding,
  resendStaffOnboarding,
  type StaffInvitationIssuanceRow,
} from "./staff-onboarding-repository";

@Injectable()
export class StaffOnboardingService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async create(
    context: StaffSessionContext,
    organizationId: string,
    command: StaffOnboardingCreate,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    return inPostgresTransaction(this.pool, async (transaction) => {
      await lockStaffOnboardingAccount(
        transaction,
        context.userId,
        command.email,
      );
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
        assurance: "SENSITIVE",
      });
      const issued = await createStaffOnboarding(transaction, {
        actorMembershipId: authority.membershipId,
        organizationId,
        operationId: command.operationId,
        command,
        fingerprint: staffOnboardingCreateFingerprint(organizationId, command),
        tokenHash: staffInvitationHash(token),
      });
      await recordAdminActivityInTransaction(transaction, context);
      return this.result(issued, token);
    });
  }

  async resend(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    command: StaffOnboardingResend,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    return inPostgresTransaction(this.pool, async (transaction) => {
      const email = await staffOnboardingTargetEmail(
        transaction,
        organizationId,
        membershipId,
      );
      await lockStaffOnboardingAccount(transaction, context.userId, email);
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
        assurance: "SENSITIVE",
      });
      const issued = await resendStaffOnboarding(transaction, {
        actorMembershipId: authority.membershipId,
        organizationId,
        membershipId,
        operationId: command.operationId,
        fingerprint: staffOnboardingResendFingerprint(
          organizationId,
          membershipId,
        ),
        tokenHash: staffInvitationHash(token),
      });
      await recordAdminActivityInTransaction(transaction, context);
      return this.result(issued, token);
    });
  }

  private result(
    row: StaffInvitationIssuanceRow,
    token: string,
  ): StaffOnboardingResult {
    const facts = {
      membershipId: row.membership_id,
      invitationId: row.invitation_id,
      generation: row.generation,
      expiresAt: row.expires_at.toISOString(),
    };
    return row.changed
      ? {
          ...facts,
          outcome: "INVITE_ISSUED",
          activationLink: staffActivationLink(token),
        }
      : { ...facts, outcome: "INVITE_PENDING_LINK_UNAVAILABLE" };
  }
}
