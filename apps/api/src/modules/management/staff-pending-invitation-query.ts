import { staffPendingInvitationSchema } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";

export async function pendingInvitationFacts(
  transaction: PostgresTransaction,
  organizationId: string,
  membershipId: string,
) {
  const result = await transaction.query<{
    generation: number;
    expires_at: Date;
    state: "CURRENT" | "EXPIRED" | "REVOKED";
  }>(
    `SELECT generation, expires_at,
       CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED'
            WHEN expires_at <= clock_timestamp() THEN 'EXPIRED'
            ELSE 'CURRENT' END AS state
     FROM public.staff_onboarding_invitations
     WHERE organization_id=$1 AND membership_id=$2 AND consumed_at IS NULL
     ORDER BY generation DESC LIMIT 1`,
    [organizationId, membershipId],
  );
  const row = result.rows[0];
  return row
    ? staffPendingInvitationSchema.parse({
        generation: row.generation,
        expiresAt: row.expires_at.toISOString(),
        state: row.state,
      })
    : null;
}
