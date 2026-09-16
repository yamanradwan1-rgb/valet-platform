import { appendControlledOperatorAccountSecurityAuditEvent } from "../../src/modules/audit/account-security-audit-writer";
import type { PostgresTransaction } from "../../src/common/database/postgres";
import {
  ControlledMfaRecoveryError,
  type MfaRecoveryArguments,
  type MfaRecoveryResult,
  type RecoveryDatabaseClient,
} from "./types";

interface AuditReplayRow extends Record<string, unknown> {
  readonly actor_type: string;
  readonly controlled_operator_ref: string | null;
  readonly event_type: string;
  readonly subject_user_id: string | null;
}

export async function persistControlledMfaRecovery(
  client: RecoveryDatabaseClient,
  input: MfaRecoveryArguments,
): Promise<MfaRecoveryResult> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('mfa-recovery-operation:' || $1::text, 0)
       )`,
      [input.operationId],
    );
    const replay = await client.query<AuditReplayRow>(
      `SELECT event_type, subject_user_id, actor_type, controlled_operator_ref
       FROM account_security_audit_events WHERE id = $1`,
      [input.operationId],
    );
    const prior = replay.rows[0];
    if (prior !== undefined) {
      if (
        replay.rowCount === 1 &&
        prior.event_type === "MFA_OPERATOR_RECOVERY" &&
        prior.subject_user_id === input.userId &&
        prior.actor_type === "CONTROLLED_OPERATOR" &&
        prior.controlled_operator_ref === input.operatorRef
      ) {
        await client.query("COMMIT");
        return { operationId: input.operationId, userId: input.userId };
      }
      throw new ControlledMfaRecoveryError("Recovery operation identity conflict.");
    }
    const user = await client.query<{ readonly status: string }>(
      `SELECT status FROM users WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    if (user.rowCount !== 1 || user.rows[0]?.status !== "ACTIVE") {
      throw new ControlledMfaRecoveryError("MFA recovery is not available.");
    }
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('mfa-user:' || $1::text, 0))`,
      [input.userId],
    );
    const factor = await client.query<{ readonly id: string }>(
      `SELECT id FROM user_mfa_totp_factors
       WHERE user_id = $1 AND state IN ('PENDING', 'ACTIVE')
       FOR UPDATE`,
      [input.userId],
    );
    const factorId = factor.rows[0]?.id;
    if (factor.rowCount !== 1 || factorId === undefined) {
      throw new ControlledMfaRecoveryError("MFA recovery is not available.");
    }
    const clock = await client.query<{ readonly now: Date }>(
      `SELECT clock_timestamp() AS now`,
    );
    const now = clock.rows[0]?.now;
    if (now === undefined) throw new Error("Recovery clock unavailable.");
    const retired = await client.query(
      `UPDATE user_mfa_totp_factors
       SET state = 'RETIRED', retired_at = $2::timestamptz
       WHERE id = $1 AND state IN ('PENDING', 'ACTIVE')`,
      [factorId, now],
    );
    if (retired.rowCount !== 1) {
      throw new ControlledMfaRecoveryError("MFA recovery is not available.");
    }
    await appendControlledOperatorAccountSecurityAuditEvent(
      client as unknown as PostgresTransaction,
      {
        actor: { type: "CONTROLLED_OPERATOR", operatorRef: input.operatorRef },
        eventId: input.operationId,
        eventType: "MFA_OPERATOR_RECOVERY",
        occurredAt: now,
        subjectUserId: input.userId,
      },
    );
    await client.query("COMMIT");
    return { operationId: input.operationId, userId: input.userId };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the bounded controlled-recovery result.
    }
    throw error;
  }
}
