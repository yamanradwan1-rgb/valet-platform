import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import type { StaffActivationResponse } from "@valet/contracts";

export class StaffActivationFailedError extends Error {
  readonly code = "STAFF_ACTIVATION_FAILED";
  constructor() {
    super("Staff activation failed.");
  }
}

export interface StaffActivationAccount {
  readonly status: "PENDING" | "ACTIVE" | "DISABLED";
  readonly password_hash: string | null;
}

export async function loadActivationAccount(
  pool: PostgresPool,
  tokenHash: string,
) {
  const result = await pool.query<StaffActivationAccount>(
    `SELECT account.status::text AS status, account.password_hash
     FROM public.staff_onboarding_invitations AS invitation
     JOIN public.organization_memberships AS member
       ON member.id=invitation.membership_id AND member.organization_id=invitation.organization_id
     JOIN public.users AS account ON account.id=member.user_id
     WHERE invitation.token_hash=$1`,
    [tokenHash],
  );
  return result.rows[0];
}

export async function activateStaffInvitation(
  transaction: PostgresTransaction,
  tokenHash: string,
  verifiedHash: string | null,
  newHash: string | null,
): Promise<StaffActivationResponse> {
  try {
    const result = await transaction.query<StaffActivationResponse>(
      "SELECT public.staff_onboarding_activate($1::text,$2::text,$3::text) AS outcome",
      [tokenHash, verifiedHash, newHash],
    );
    const outcome = result.rows[0]?.outcome;
    if (outcome !== "ACTIVATED" && outcome !== "ALREADY_ACTIVATED") {
      throw new StaffActivationFailedError();
    }
    return { outcome };
  } catch (error) {
    if (
      (error as { message?: unknown }).message === "STAFF_ACTIVATION_FAILED"
    ) {
      throw new StaffActivationFailedError();
    }
    throw error;
  }
}
