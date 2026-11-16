import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  StaffOnboardingCreate,
  StaffOnboardingResend,
  StaffOnboardingResult,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { AntiAbuseScope } from "../anti-abuse/anti-abuse-key";
import {
  AntiAbuseUnavailableError,
  AntiAbuseService,
  type AntiAbuseReservation,
  type AntiAbuseReservationState,
} from "../anti-abuse/anti-abuse.service";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { ManagementCommandContext } from "./management-command-context";
import { MANAGEMENT_POSTGRES_POOL } from "./management-writer-database.module";
import { authorizeStaffManagementPreflight } from "./staff-management-authorization";
import { StaffOnboardingRateLimitedError } from "./staff-onboarding-errors";
import {
  generateStaffInvitationToken,
  staffInvitationHash,
} from "./staff-invitation-credential";
import { staffOnboardingTargetEmail } from "./staff-onboarding-account-lock";
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

interface PreparedOnboardingOperation {
  readonly actorMembershipId: string;
  readonly reservation: AntiAbuseReservation | undefined;
}

@Injectable()
export class StaffOnboardingService {
  private readonly logger = new Logger(StaffOnboardingService.name);

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    @Inject(MANAGEMENT_POSTGRES_POOL)
    private readonly managementWriterPool: PostgresPool,
  ) {}

  async create(
    context: ManagementCommandContext,
    organizationId: string,
    command: StaffOnboardingCreate,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    const prepared = await this.reserveFreshOperation(
      context,
      organizationId,
      command.operationId,
      "v1:staff-onboarding-create-organization",
      organizationId,
      CREATE_ISSUANCE_LIMIT,
    );
    const reservation = prepared.reservation;
    let domainCallbackCompleted = false;
    try {
      const committed = await inPostgresTransaction(
        this.managementWriterPool,
        async (transaction) => {
          const issued = await createStaffOnboarding(transaction, context, {
            actorMembershipId: prepared.actorMembershipId,
            organizationId,
            operationId: command.operationId,
            command,
            fingerprint: staffOnboardingCreateFingerprint(
              organizationId,
              command,
            ),
            tokenHash: staffInvitationHash(token),
          });
          const response = this.result(issued, token);
          domainCallbackCompleted = true;
          return { changed: issued.changed, response };
        },
      );
      await this.finalizeConfirmedIssuance(
        reservation,
        committed.changed ? "COUNTED" : "IGNORED",
      );
      return committed.response;
    } catch (error) {
      // Callback success followed by a failed COMMIT has an unknown outcome.
      // A PENDING reservation conservatively counts until receipt reconciliation.
      if (reservation !== undefined && !domainCallbackCompleted) {
        await this.antiAbuse.finalize(reservation, "IGNORED");
      }
      throw error;
    }
  }

  async resend(
    context: ManagementCommandContext,
    organizationId: string,
    membershipId: string,
    command: StaffOnboardingResend,
  ): Promise<StaffOnboardingResult> {
    const token = generateStaffInvitationToken();
    const prepared = await this.reserveFreshOperation(
      context,
      organizationId,
      command.operationId,
      "v1:staff-onboarding-resend-membership",
      membershipId,
      RESEND_ISSUANCE_LIMIT,
      membershipId,
    );
    const reservation = prepared.reservation;
    let domainCallbackCompleted = false;
    try {
      const committed = await inPostgresTransaction(
        this.managementWriterPool,
        async (transaction) => {
          const issued = await resendStaffOnboarding(transaction, context, {
            actorMembershipId: prepared.actorMembershipId,
            organizationId,
            membershipId,
            operationId: command.operationId,
            fingerprint: staffOnboardingResendFingerprint(
              organizationId,
              membershipId,
            ),
            tokenHash: staffInvitationHash(token),
          });
          const response = this.result(issued, token);
          domainCallbackCompleted = true;
          return { changed: issued.changed, response };
        },
      );
      await this.finalizeConfirmedIssuance(
        reservation,
        committed.changed ? "COUNTED" : "IGNORED",
      );
      return committed.response;
    } catch (error) {
      if (reservation !== undefined && !domainCallbackCompleted) {
        await this.antiAbuse.finalize(reservation, "IGNORED");
      }
      throw error;
    }
  }

  private async reserveFreshOperation(
    context: StaffSessionContext,
    organizationId: string,
    operationId: string,
    scope: AntiAbuseScope,
    keyValue: string,
    limit: number,
    targetMembershipId?: string,
  ): Promise<PreparedOnboardingOperation> {
    // Preflight lease ends before the independent durable limiter lease begins.
    // The protected raw-bearer wrapper rechecks session, MFA, actor and tenant
    // authority after the domain locks are acquired in the writer transaction.
    const preflight = await inPostgresTransaction(
      this.pool,
      async (transaction) => {
        const authority = await authorizeStaffManagementPreflight(
          transaction,
          context,
          { organizationId },
        );
        if (targetMembershipId !== undefined) {
          await staffOnboardingTargetEmail(
            transaction,
            organizationId,
            targetMembershipId,
          );
        }
        return {
          actorMembershipId: authority.membershipId,
          alreadyIssued: await staffOnboardingOperationExists(
            transaction,
            organizationId,
            operationId,
          ),
        };
      },
    );
    if (preflight.alreadyIssued) {
      return {
        actorMembershipId: preflight.actorMembershipId,
        reservation: undefined,
      };
    }
    const decision = await this.antiAbuse.reserve(
      this.antiAbuse.key(scope, keyValue),
      limit,
    );
    if (!decision.allowed) {
      throw new StaffOnboardingRateLimitedError(decision.retryAfter);
    }
    return {
      actorMembershipId: preflight.actorMembershipId,
      reservation: decision.reservation,
    };
  }

  private async finalizeConfirmedIssuance(
    reservation: AntiAbuseReservation | undefined,
    state: AntiAbuseReservationState,
  ): Promise<void> {
    if (reservation === undefined) return;
    try {
      await this.antiAbuse.finalize(reservation, state);
    } catch (error) {
      if (!(error instanceof AntiAbuseUnavailableError)) throw error;
      // The domain COMMIT was acknowledged. A pending reservation is counted
      // conservatively; an unknown finalization outcome needs reconciliation.
      // Rejecting now would permanently lose the one-time plaintext link.
      this.logger.warn(
        "Committed staff onboarding quota finalization unconfirmed; investigate reservation state.",
      );
    }
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
