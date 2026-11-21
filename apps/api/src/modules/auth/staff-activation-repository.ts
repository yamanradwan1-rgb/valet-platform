import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import type { StaffActivationResponse } from "@valet/contracts";
import type { AntiAbuseReservation } from "../anti-abuse/anti-abuse.service";

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

/** Read-only, exact recovery after a lost activation COMMIT acknowledgement. */
export async function verifyCommittedStaffActivation(
  reader: PostgresPool,
  tokenHash: string,
  previousHash: string | null,
  newHash: string | null,
  reservations: readonly AntiAbuseReservation[],
): Promise<boolean> {
  const result = await reader.query<{ complete: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.staff_onboarding_invitations AS invitation
       JOIN public.organization_memberships AS member
         ON member.id=invitation.membership_id AND member.organization_id=invitation.organization_id
       JOIN public.users AS account ON account.id=member.user_id
       WHERE invitation.token_hash=$1 AND invitation.consumed_at IS NOT NULL
         AND member.status='ACTIVE' AND account.status='ACTIVE'
         AND ($2::text IS NULL OR account.password_hash=$2)
         AND ($3::text IS NULL OR account.password_hash=$3)
         AND EXISTS (
           SELECT 1 FROM public.audit_events AS audit
           WHERE audit.organization_id=invitation.organization_id
             AND audit.entity_type='OrganizationMembership' AND audit.entity_id=member.id
             AND audit.event_type='STAFF_ONBOARDING_ACTIVATED'
             AND audit.metadata_json->>'invitationId'=invitation.id::text
             AND audit.metadata_json->>'generation'=invitation.generation::text
         )
     ) AS complete`,
    [tokenHash, previousHash, newHash],
  );
  if (result.rows[0]?.complete !== true) return false;
  for (const reservation of reservations) {
    if (!reservation.id) return false;
    const finalized = await reader.query<{ finalized: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM anti_abuse_events
         WHERE id=$1 AND scope=$2 AND key_hash=$3 AND state='IGNORED') AS finalized`,
      [reservation.id, reservation.key.scope, reservation.key.keyHash],
    );
    if (finalized.rows[0]?.finalized !== true) return false;
  }
  return true;
}
