import type { StaffOnboardingCreate } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
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
  input: IssuanceIdentity & { readonly command: StaffOnboardingCreate },
): Promise<StaffInvitationIssuanceRow> {
  return execute(
    transaction,
    `SELECT * FROM public.staff_onboarding_create(
      $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,
      $8::membership_role,$9::uuid[],$10::text
    )`,
    [
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
  input: IssuanceIdentity & { readonly membershipId: string },
): Promise<StaffInvitationIssuanceRow> {
  return execute(
    transaction,
    `SELECT * FROM public.staff_onboarding_resend(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text
    )`,
    [
      input.actorMembershipId,
      input.organizationId,
      input.membershipId,
      input.operationId,
      input.fingerprint,
      input.tokenHash,
    ],
  );
}
