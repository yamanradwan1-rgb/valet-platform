import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffOnboardingCreate,
  StaffOnboardingResend,
  StaffOnboardingResult,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import type { PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { AntiAbuseScope } from "../anti-abuse/anti-abuse-key";
import {
  AntiAbuseService,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeStaffManagement } from "./staff-management-authorization";
import { StaffOnboardingRateLimitedError } from "./staff-onboarding-errors";
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
  staffOnboardingOperationExists,
  type StaffInvitationIssuanceRow,
} from "./staff-onboarding-repository";

const CREATE_ISSUANCE_LIMIT = 20;
const RESEND_ISSUANCE_LIMIT = 5;

@Injectable()
export class StaffOnboardingService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
  ) {}

  async create(
    context: StaffSessionContext,
    organizationId: string,
    command: StaffOnboardingCreate,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    let reservation: AntiAbuseReservation | undefined;
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        await lockStaffOnboardingAccount(
          transaction,
          context.userId,
          command.email,
        );
        const authority = await authorizeStaffManagement(transaction, context, {
          organizationId,
          assurance: "SENSITIVE",
        });
        reservation = await this.reserveFreshOperation(
          transaction,
          organizationId,
          command.operationId,
          "v1:staff-onboarding-create-organization",
          organizationId,
          CREATE_ISSUANCE_LIMIT,
        );
        const issued = await createStaffOnboarding(transaction, {
          actorMembershipId: authority.membershipId,
          organizationId,
          operationId: command.operationId,
          command,
          fingerprint: staffOnboardingCreateFingerprint(
            organizationId,
            command,
          ),
          tokenHash: staffInvitationHash(token),
        });
        if (reservation !== undefined) {
          await this.antiAbuse.finalizeInTransaction(
            transaction,
            reservation,
            issued.changed ? "COUNTED" : "IGNORED",
          );
        }
        await recordAdminActivityInTransaction(transaction, context);
        return this.result(issued, token);
      });
    } catch (error) {
      if (reservation !== undefined) {
        await this.antiAbuse.finalize(reservation, "IGNORED");
      }
      throw error;
    }
  }

  async resend(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    command: StaffOnboardingResend,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    let reservation: AntiAbuseReservation | undefined;
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
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
        reservation = await this.reserveFreshOperation(
          transaction,
          organizationId,
          command.operationId,
          "v1:staff-onboarding-resend-membership",
          membershipId,
          RESEND_ISSUANCE_LIMIT,
        );
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
        if (reservation !== undefined) {
          await this.antiAbuse.finalizeInTransaction(
            transaction,
            reservation,
            issued.changed ? "COUNTED" : "IGNORED",
          );
        }
        await recordAdminActivityInTransaction(transaction, context);
        return this.result(issued, token);
      });
    } catch (error) {
      if (reservation !== undefined) {
        await this.antiAbuse.finalize(reservation, "IGNORED");
      }
      throw error;
    }
  }

  private async reserveFreshOperation(
    transaction: PostgresTransaction,
    organizationId: string,
    operationId: string,
    scope: AntiAbuseScope,
    keyValue: string,
    limit: number,
  ): Promise<AntiAbuseReservation | undefined> {
    if (
      await staffOnboardingOperationExists(
        transaction,
        organizationId,
        operationId,
      )
    ) {
      return undefined;
    }
    const decision = await this.antiAbuse.reserve(
      this.antiAbuse.key(scope, keyValue),
      limit,
    );
    if (!decision.allowed) {
      throw new StaffOnboardingRateLimitedError(decision.retryAfter);
    }
    return decision.reservation;
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
