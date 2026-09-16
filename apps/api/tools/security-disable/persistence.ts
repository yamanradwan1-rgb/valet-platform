import type { PostgresTransaction } from "../../src/common/database/postgres";
import { appendControlledOperatorAccountSecurityAuditEvent } from "../../src/modules/audit/account-security-audit-writer";
import { lockStaffUserSecurityBoundary } from "../../src/modules/auth/staff-user-security-lock";
import {
  ControlledSecurityDisableError,
  type SecurityDisableArguments,
  type SecurityDisableDatabaseClient,
  type SecurityDisableResult,
} from "./types";

interface ReplayRow extends Record<string, unknown> {
  readonly actor_type: string;
  readonly controlled_operator_ref: string | null;
  readonly event_type: string;
  readonly subject_user_id: string | null;
}

export async function persistControlledSecurityDisable(
  client: SecurityDisableDatabaseClient,
  input: SecurityDisableArguments,
): Promise<SecurityDisableResult> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('staff-security-disable:' || $1::text, 0)
       )`,
      [input.operationId],
    );
    const replay = await client.query<ReplayRow>(
      `SELECT event_type, subject_user_id, actor_type, controlled_operator_ref
       FROM account_security_audit_events WHERE id = $1`,
      [input.operationId],
    );
    const prior = replay.rows[0];
    if (prior !== undefined) {
      if (
        replay.rowCount === 1 &&
        prior.event_type === "STAFF_USER_SECURITY_DISABLED" &&
        prior.subject_user_id === input.userId &&
        prior.actor_type === "CONTROLLED_OPERATOR" &&
        prior.controlled_operator_ref === input.operatorRef
      ) {
        await client.query("COMMIT");
        return { operationId: input.operationId, userId: input.userId };
      }
      throw new ControlledSecurityDisableError(
        "Security-disable operation identity conflict.",
      );
    }

    await lockStaffUserSecurityBoundary(
      client as unknown as PostgresTransaction,
      input.userId,
    );
    const locked = await client.query<{ readonly status: string }>(
      `SELECT status::text FROM users WHERE id=$1 FOR UPDATE`,
      [input.userId],
    );
    const user = locked.rows[0];
    if (user === undefined || user.status !== "ACTIVE") {
      throw new ControlledSecurityDisableError(
        "Staff security disable is not available.",
      );
    }
    const clock = await client.query<{ readonly now: Date }>(
      `SELECT clock_timestamp() AS now`,
    );
    const now = clock.rows[0]?.now;
    if (now === undefined) throw new Error("Security-disable clock unavailable.");

    await client.query(
      `UPDATE users SET status='DISABLED', updated_at=$2::timestamptz WHERE id=$1`,
      [input.userId, now],
    );
    await client.query(
      `UPDATE staff_auth_sessions
       SET revoked_at=COALESCE(revoked_at,$2::timestamptz)
       WHERE user_id=$1 AND revoked_at IS NULL`,
      [input.userId, now],
    );
    await client.query(
      `UPDATE staff_push_registrations AS registration
       SET state='DISABLED', provider_token=NULL,
           terminal_at=$2::timestamptz,
           terminal_reason_class='USER_SECURITY_DISABLED',
           updated_at=$2::timestamptz
       FROM staff_auth_sessions AS session
       WHERE registration.staff_auth_session_id=session.id
         AND session.user_id=$1 AND registration.state='ACTIVE'`,
      [input.userId, now],
    );
    await appendControlledOperatorAccountSecurityAuditEvent(
      client as unknown as PostgresTransaction,
      {
        actor: { type: "CONTROLLED_OPERATOR", operatorRef: input.operatorRef },
        eventId: input.operationId,
        eventType: "STAFF_USER_SECURITY_DISABLED",
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
      // Preserve the bounded controlled-operation result.
    }
    throw error;
  }
}
