import type { StaffOnboardingCreate } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { ManagementCommandContext } from "./management-command-context";
import { throwStaffOnboardingDatabaseError } from "./staff-onboarding-errors";

export interface StaffInvitationIssuanceRow {
  readonly membership_id: string;
  readonly invitation_id: string;
  readonly generation: number;
  readonly expires_at: Date;
  readonly changed: boolean;
}

interface IssuanceIdentity {
  readonly actorMembershipId: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly fingerprint: string;
  readonly tokenHash: string;
}

export async function staffOnboardingOperationExists(
  transaction: PostgresTransaction,
  organizationId: string,
  operationId: string,
): Promise<boolean> {
  const result = await transaction.query(
    `SELECT 1 FROM staff_onboarding_invitations
     WHERE organization_id = $1 AND operation_id = $2`,
    [organizationId, operationId],
  );
  return result.rowCount === 1;
}

async function execute(
  transaction: PostgresTransaction,
  sql: string,
  values: readonly unknown[],
): Promise<StaffInvitationIssuanceRow> {
  try {
    const result = await transaction.query<StaffInvitationIssuanceRow>(sql, [
      ...values,
    ]);
    const row = result.rows[0];
    if (row === undefined || result.rowCount !== 1) {
      throw new Error("Staff onboarding command returned no result.");
    }
    return row;
  } catch (error) {
    return throwStaffOnboardingDatabaseError(error);
  }
}

export function createStaffOnboarding(
  transaction: PostgresTransaction,
  context: ManagementCommandContext,
  input: IssuanceIdentity & { readonly command: StaffOnboardingCreate },
): Promise<StaffInvitationIssuanceRow> {
  return execute(
    transaction,
    `SELECT * FROM public.staff_management_authorized_onboarding_create(
      $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,
      $7::text,$8::text,$9::text,$10::text,
      $11::membership_role,$12::uuid[],$13::text
    )`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.rawAccessToken,
      input.actorMembershipId,
      input.organizationId,
      input.operationId,
      input.fingerprint,
      input.command.email,
      input.command.firstName,
      input.command.lastName,
      input.command.role,
      input.command.locationIds,
      input.tokenHash,
    ],
  );
}

export function resendStaffOnboarding(
  transaction: PostgresTransaction,
  context: ManagementCommandContext,
  input: IssuanceIdentity & { readonly membershipId: string },
): Promise<StaffInvitationIssuanceRow> {
  return execute(
    transaction,
    `SELECT * FROM public.staff_management_authorized_onboarding_resend(
      $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,
      $7::uuid,$8::text,$9::text
    )`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.rawAccessToken,
      input.actorMembershipId,
      input.organizationId,
      input.membershipId,
      input.operationId,
      input.fingerprint,
      input.tokenHash,
    ],
  );
}
