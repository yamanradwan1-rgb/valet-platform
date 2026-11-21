import type { PostgresTransaction } from "../../common/database/postgres";
import { Issue416ResetUnavailableError } from "../auth/issue416-password-reset-errors";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const audience = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const sha256 = /^[0-9a-f]{64}$/;
const tokenHash = /^staff-password-reset-sha256:v1:[0-9a-f]{64}$/;

export interface Issue416R02KnownIssueIdentity {
  readonly audience: string;
  readonly operationId: string;
  readonly resetId: string;
  readonly organizationId: string;
  readonly targetMembershipId: string;
  readonly targetUserId: string;
  readonly issuerMembershipId: string;
  readonly issuerUserId: string;
  readonly expectedGeneration: number;
  readonly issueAuditEventId: string;
  /** Hash of a fresh, app-only vspr1. credential, never the bearer. */
  readonly tokenHash: string;
  /** Derived by a trusted request-scoped signer, not an HTTP client. */
  readonly requestFingerprintHex: string;
}

/**
 * Reviewable R02 after-write, before-COMMIT read-only predicate. It is NOT an
 * issuer/signer, independent authority or grant. The future signed private
 * writer must lock and recheck live CA/target/membership/MFA/entitlement and
 * preserve four R02 quota reservations. A quota bundle may still be PENDING
 * at domain COMMIT: its separately leased receipt finalizer runs later.
 */
export const ISSUE416_R02_ATOMIC_CLOSURE_SQL = `
  WITH issued AS (
    SELECT r.id, r.audience, r.organization_id, r.operation_id,
           r.request_fingerprint, r.issue_audit_event_id,
           r.issuer_user_id, r.issued_by_membership_id, r.target_user_id
    FROM auth_proof_private.staff_password_reset_requests r
    JOIN auth_proof_private.reset_issue_quota_bundles quota
      ON quota.audience = r.audience
     AND quota.operation_id = r.operation_id
    WHERE r.audience = $1::text AND r.operation_id = $2::uuid
      AND r.id = $3::uuid AND r.organization_id = $4::uuid
      AND r.target_membership_id = $5::uuid
      AND r.target_user_id = $6::uuid
      AND r.issued_by_membership_id = $7::uuid
      AND r.issuer_user_id = $8::uuid
      AND r.generation = $9::bigint
      AND r.issue_audit_event_id = $10::uuid
      AND r.token_hash = $11::text
      AND r.request_fingerprint = pg_catalog.decode($12::text, 'hex')
      AND r.consumed_at IS NULL AND r.revoked_at IS NULL
      AND quota.request_fingerprint = r.request_fingerprint
      AND quota.organization_id = r.organization_id
      AND quota.issuer_user_id = r.issuer_user_id
      AND quota.issuer_membership_id = r.issued_by_membership_id
      AND quota.target_user_id = r.target_user_id
      AND quota.target_membership_id = r.target_membership_id
      AND quota.state IN ('PENDING','COUNTED')
  )
  SELECT (
    EXISTS (
      SELECT 1 FROM issued r
      JOIN auth_proof_private.reset_issue_domain_evidence e
        ON e.audience = r.audience
       AND e.operation_id = r.operation_id
       AND e.reset_id = r.id
       AND e.audit_event_id = r.issue_audit_event_id
       AND e.request_fingerprint = r.request_fingerprint
      JOIN auth_proof_private.operation_receipts receipt
        ON receipt.audience = e.audience AND receipt.operation_id = e.operation_id
       AND receipt.challenge_id = e.challenge_id
       AND receipt.audit_event_id = e.audit_event_id
      JOIN auth_proof_private.proof_challenges challenge
        ON challenge.challenge_id = e.challenge_id
       AND challenge.audience = e.audience
       AND challenge.operation_id = e.operation_id
       AND challenge.payload_digest = receipt.payload_digest
       AND challenge.state_digest = receipt.state_digest
      JOIN public.account_security_audit_events audit
        ON audit.id = e.audit_event_id
      WHERE e.outcome = 'CHANGED' AND e.reset_generation = $9::bigint
        AND receipt.purpose = 'RESET_ISSUE'
        AND receipt.outcome = 'COMPLETED'
        AND challenge.purpose = 'RESET_ISSUE'
        AND challenge.consumed_at IS NOT NULL
        AND challenge.actor_kind = 'STAFF'
        AND challenge.actor_user_id = r.issuer_user_id
        AND challenge.membership_id = r.issued_by_membership_id
        AND challenge.actor_session_id IS NOT NULL
        AND challenge.organization_id = r.organization_id
        AND challenge.subject_user_id = r.target_user_id
        AND audit.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'
        AND audit.actor_type = 'USER'
        AND audit.actor_user_id = r.issuer_user_id
        AND audit.subject_user_id = r.target_user_id
    )
    AND (
      SELECT count(*) FROM auth_proof_private.reset_issue_quota_entries entry
      WHERE entry.audience = $1::text AND entry.operation_id = $2::uuid
        AND entry.state IN ('PENDING','COUNTED')
    ) = 4
    AND (
      SELECT count(DISTINCT entry.scope)
      FROM auth_proof_private.reset_issue_quota_entries entry
      WHERE entry.audience = $1::text AND entry.operation_id = $2::uuid
        AND entry.scope IN (
          'v1:staff-password-reset-issue-target-user',
          'v1:staff-password-reset-issue-issuer-user',
          'v1:staff-password-reset-issue-organization',
          'v1:staff-password-reset-issue-client-address'
        )
    ) = 4
    AND NOT EXISTS (
      SELECT 1 FROM auth_proof_private.staff_password_reset_requests sibling
      WHERE sibling.target_user_id = $6::uuid AND sibling.id <> $3::uuid
        AND sibling.consumed_at IS NULL AND sibling.revoked_at IS NULL
    )
  ) AS "closureOk"
`;

/** Never use an ordinary runtime pool; only a future verified private tx. */
export async function assertIssue416R02AtomicClosureInTrustedTransaction(
  transaction: Pick<PostgresTransaction, "query">,
  identity: Issue416R02KnownIssueIdentity,
): Promise<void> {
  if (
    !audience.test(identity.audience) ||
    ![
      identity.operationId,
      identity.resetId,
      identity.organizationId,
      identity.targetMembershipId,
      identity.targetUserId,
      identity.issuerMembershipId,
      identity.issuerUserId,
      identity.issueAuditEventId,
    ].every((id) => uuid.test(id)) ||
    !Number.isSafeInteger(identity.expectedGeneration) ||
    identity.expectedGeneration < 0 ||
    identity.expectedGeneration >= Number.MAX_SAFE_INTEGER ||
    !tokenHash.test(identity.tokenHash) ||
    !sha256.test(identity.requestFingerprintHex)
  ) {
    throw new Issue416ResetUnavailableError();
  }
  try {
    const result = await transaction.query<{ readonly closureOk: boolean }>(
      ISSUE416_R02_ATOMIC_CLOSURE_SQL,
      [
        identity.audience,
        identity.operationId,
        identity.resetId,
        identity.organizationId,
        identity.targetMembershipId,
        identity.targetUserId,
        identity.issuerMembershipId,
        identity.issuerUserId,
        identity.expectedGeneration + 1,
        identity.issueAuditEventId,
        identity.tokenHash,
        identity.requestFingerprintHex,
      ],
    );
    if (result.rowCount !== 1 || result.rows[0]?.closureOk !== true) {
      throw new Issue416ResetUnavailableError();
    }
  } catch {
    throw new Issue416ResetUnavailableError();
  }
}
