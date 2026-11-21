import type { PostgresTransaction } from "../../common/database/postgres";
import { isAcceptedStaffPasswordHash } from "./staff-password-verification";
import { Issue416ResetUnavailableError } from "./issue416-password-reset-errors";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tokenHash = /^staff-password-reset-sha256:v1:[0-9a-f]{64}$/;
const audience = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

export interface Issue416R03AtomicClosureIdentity {
  readonly audience: string;
  readonly resetId: string;
  readonly generation: number;
  readonly targetUserId: string;
  readonly redeemOperationId: string;
  readonly redeemAuditEventId: string;
  readonly tokenHash: string;
  /** Accepted Argon2id PHC; never a raw password. */
  readonly newPasswordHash: string;
}

/**
 * ONE read-only snapshot AFTER protected DML and BEFORE COMMIT in the very
 * SAME locked, privileged transaction. This cannot validate raw bearer
 * possession, signer authenticity, lock ordering or COMMIT success. The
 * source is deliberately never called from any registered API controller.
 *
 * Refresh rows have no revoked_at. Revoking ALL owner sessions invalidates
 * every dependent refresh generation, even an expired unconsumed credential.
 * Do NOT set consumed_at on old expired refresh rows: schema forbids it.
 */
export const ISSUE416_R03_ATOMIC_CLOSURE_SQL = `
  WITH reset AS (
    SELECT r.id, r.audience, r.organization_id, r.target_user_id,
           r.issuer_user_id, r.issued_by_membership_id, r.operation_id,
           r.generation, r.token_hash,
           r.redeem_operation_id, r.redeem_audit_event_id
    FROM auth_proof_private.staff_password_reset_requests AS r
    WHERE r.id = $1::uuid AND r.target_user_id = $2::uuid
      AND r.generation = $3::bigint
      AND r.redeem_operation_id = $4::uuid
      AND r.redeem_audit_event_id = $5::uuid
      AND r.token_hash = $6::text AND r.audience = $8::text
      AND r.consumed_at IS NOT NULL
      AND r.consumed_at >= r.created_at
      AND r.consumed_at < r.expires_at
      AND r.revoked_at IS NULL
  )
  SELECT (
    EXISTS (
      SELECT 1 FROM reset r
      JOIN public.users u ON u.id = r.target_user_id
      WHERE u.password_hash = $7::text
    )
    AND EXISTS (
      SELECT 1 FROM reset r
      JOIN public.account_security_audit_events a
        ON a.id = r.redeem_audit_event_id
      WHERE a.event_type = 'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'
        AND a.actor_type = 'ANONYMOUS'
        AND a.actor_user_id IS NULL
        AND a.subject_user_id = r.target_user_id
    )
    AND EXISTS (
      SELECT 1 FROM reset r
      JOIN auth_proof_private.reset_redeem_domain_evidence e
        ON e.reset_id = r.id
       AND e.redeem_operation_id = r.redeem_operation_id
       AND e.audit_event_id = r.redeem_audit_event_id
       AND e.audience = r.audience
       AND e.reset_generation = r.generation
       AND e.token_hash = r.token_hash
       AND e.organization_id = r.organization_id
       AND e.target_user_id = r.target_user_id
       AND e.issuer_user_id = r.issuer_user_id
       AND e.issuer_membership_id = r.issued_by_membership_id
       AND e.issue_operation_id = r.operation_id
      JOIN auth_proof_private.operation_receipts receipt
        ON receipt.audience = e.audience
       AND receipt.operation_id = e.redeem_operation_id
       AND receipt.audit_event_id = e.audit_event_id
       AND receipt.challenge_id = e.challenge_id
       AND receipt.payload_digest = e.payload_digest
       AND receipt.state_digest = e.state_digest
      JOIN auth_proof_private.proof_challenges challenge
        ON challenge.challenge_id = receipt.challenge_id
       AND challenge.audience = receipt.audience
       AND challenge.operation_id = receipt.operation_id
       AND challenge.payload_digest = receipt.payload_digest
       AND challenge.state_digest = receipt.state_digest
      WHERE receipt.purpose = 'RESET_REDEEM'
        AND receipt.outcome = 'COMPLETED'
        AND challenge.purpose = 'RESET_REDEEM'
        AND challenge.consumed_at IS NOT NULL
        AND challenge.actor_kind = 'ANONYMOUS'
        AND challenge.actor_user_id IS NULL
        AND challenge.actor_session_id IS NULL
        AND challenge.membership_id IS NULL
        AND challenge.organization_id = r.organization_id
        AND challenge.subject_user_id = r.target_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_auth_sessions s
      WHERE s.user_id = $2::uuid AND s.revoked_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_refresh_credentials rc
      JOIN public.staff_auth_sessions s ON s.id = rc.session_id
      WHERE s.user_id = $2::uuid
        AND s.revoked_at IS NULL AND rc.consumed_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_push_registrations p
      JOIN public.staff_auth_sessions s ON s.id = p.staff_auth_session_id
      WHERE s.user_id = $2::uuid
        AND (p.state = 'ACTIVE' OR p.provider_token IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM auth_proof_private.staff_password_reset_requests sibling
      WHERE sibling.target_user_id = $2::uuid AND sibling.id <> $1::uuid
        AND sibling.consumed_at IS NULL AND sibling.revoked_at IS NULL
    )
  ) AS "closureOk"
`;

/**
 * Source-only optional postcondition for a FUTURE trusted private R03 writer.
 * NEVER use a standalone transaction/ordinary runtime pool: private SELECT
 * grants intentionally do not exist. A true result is not a signed proof and
 * must not authorize a response before the containing transaction COMMIT.
 */
export async function assertIssue416R03AtomicClosureInTrustedTransaction(
  transaction: Pick<PostgresTransaction, "query">,
  expected: Issue416R03AtomicClosureIdentity,
): Promise<void> {
  if (
    !audience.test(expected.audience) ||
    ![
      expected.resetId,
      expected.targetUserId,
      expected.redeemOperationId,
      expected.redeemAuditEventId,
    ].every((value) => uuid.test(value)) ||
    !Number.isSafeInteger(expected.generation) ||
    expected.generation <= 0 ||
    !tokenHash.test(expected.tokenHash) ||
    !isAcceptedStaffPasswordHash(expected.newPasswordHash)
  ) {
    throw new Issue416ResetUnavailableError();
  }
  try {
    const result = await transaction.query<{ readonly closureOk: boolean }>(
      ISSUE416_R03_ATOMIC_CLOSURE_SQL,
      [
        expected.resetId,
        expected.targetUserId,
        expected.generation,
        expected.redeemOperationId,
        expected.redeemAuditEventId,
        expected.tokenHash,
        expected.newPasswordHash,
        expected.audience,
      ],
    );
    if (result.rowCount !== 1 || result.rows[0]?.closureOk !== true) {
      throw new Issue416ResetUnavailableError();
    }
  } catch {
    throw new Issue416ResetUnavailableError();
  }
}
