import { staffPasswordResetStatusResponseSchema, type StaffPasswordResetStatusResponse } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import { Issue416ResetUnavailableError } from "../auth/issue416-password-reset-errors";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface Issue416R01ScopedTarget {
  readonly organizationId: string;
  readonly targetMembershipId: string;
  readonly targetUserId: string;
}

interface StatusRow {
  readonly latestGeneration: string;
  readonly linkState: "NONE" | "ACTIVE" | "EXPIRED" | "CONSUMED" | "REVOKED";
  readonly expiresAt: Date | null;
}

/**
 * Safe, read-only R01 projection. The caller MUST run this on the private
 * trusted transaction AFTER independently proving current CA, entitlement,
 * exact-session MFA and the sole-company target under consistent locks.
 * A preflight context, bearer hash or ordinary runtime role is not authority.
 * This function never grants private SELECT or registers an HTTP endpoint.
 */
export const ISSUE416_R01_SAFE_STATUS_SQL = `
  SELECT COALESCE(latest.generation::text, '0') AS "latestGeneration",
         CASE WHEN latest.generation IS NULL THEN 'NONE'
              WHEN latest.consumed_at IS NOT NULL THEN 'CONSUMED'
              WHEN latest.revoked_at IS NOT NULL THEN 'REVOKED'
              WHEN latest.expires_at <= pg_catalog.clock_timestamp() THEN 'EXPIRED'
              ELSE 'ACTIVE' END AS "linkState",
         latest.expires_at AS "expiresAt"
  FROM (SELECT 1) AS anchor
  LEFT JOIN LATERAL (
    SELECT generation, expires_at, consumed_at, revoked_at
    FROM auth_proof_private.staff_password_reset_requests
    WHERE organization_id = $1::uuid
      AND target_membership_id = $2::uuid
      AND target_user_id = $3::uuid
    ORDER BY generation DESC
    LIMIT 1
  ) AS latest ON TRUE
`;

export async function readIssue416R01StatusInTrustedTransaction(
  transaction: Pick<PostgresTransaction, "query">,
  target: Issue416R01ScopedTarget,
): Promise<StaffPasswordResetStatusResponse> {
  if (![target.organizationId, target.targetMembershipId, target.targetUserId].every(
    (id) => uuid.test(id),
  )) throw new Issue416ResetUnavailableError();

  try {
    const result = await transaction.query<StatusRow>(ISSUE416_R01_SAFE_STATUS_SQL, [
      target.organizationId, target.targetMembershipId, target.targetUserId,
    ]);
    if (result.rowCount !== 1 || result.rows.length !== 1) {
      throw new Issue416ResetUnavailableError();
    }
    const row = result.rows[0];
    if (row === undefined || !/^(0|[1-9][0-9]*)$/.test(row.latestGeneration)) {
      throw new Issue416ResetUnavailableError();
    }
    const generation = Number(row.latestGeneration);
    if (
      !Number.isSafeInteger(generation) ||
      (generation === 0) !== (row.linkState === "NONE") ||
      (generation === 0) !== (row.expiresAt === null)
    ) {
      throw new Issue416ResetUnavailableError();
    }
    const expiresAt = row.expiresAt === null ? null : new Date(row.expiresAt).toISOString();
    return staffPasswordResetStatusResponseSchema.parse({
      eligible: true,
      latestGeneration: generation,
      linkState: row.linkState,
      expiresAt,
    });
  } catch {
    throw new Issue416ResetUnavailableError();
  }
}
