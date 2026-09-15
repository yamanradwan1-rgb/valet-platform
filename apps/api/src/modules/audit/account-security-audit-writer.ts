import type { PostgresTransaction } from "../../common/database/postgres";
import {
  AuditEventIdentityConflictError,
  type RuntimeAccountSecurityAuditActor,
  requireAuditEventType,
  requireAuditUuid,
  validateAccountSecurityActor,
} from "./audit-foundation-validation";

export interface AccountSecurityAuditEventInput {
  readonly actor: RuntimeAccountSecurityAuditActor;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly subjectUserId: string | null;
}

export interface ControlledOperatorAccountSecurityAuditEventInput
  extends Omit<AccountSecurityAuditEventInput, "actor"> {
  readonly actor: {
    readonly operatorRef: string;
    readonly type: "CONTROLLED_OPERATOR";
  };
}

interface PostgresError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

export async function appendAccountSecurityAuditEvent(
  transaction: PostgresTransaction,
  input: AccountSecurityAuditEventInput,
): Promise<string> {
  requireAuditUuid(input.eventId);
  requireAuditEventType(input.eventType);
  if (input.subjectUserId !== null) requireAuditUuid(input.subjectUserId);
  validateAccountSecurityActor(input.actor);
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new Error("Account-security audit occurrence time is invalid.");
  }

  const actorUserId = input.actor.type === "USER" ? input.actor.userId : null;
  try {
    const result = await transaction.query<{ id: string }>(
      `SELECT append_runtime_account_security_audit_event(
         $1::uuid, $2::text, $3::uuid, $4::account_security_actor_type,
         $5::uuid, $6::timestamptz
       )::text AS id`,
      [
        input.eventId,
        input.eventType,
        input.subjectUserId,
        input.actor.type,
        actorUserId,
        input.occurredAt,
      ],
    );
    const id = result.rows[0]?.id;
    if (id !== input.eventId) {
      throw new Error("Account-security audit persistence returned no event.");
    }
    return id;
  } catch (error) {
    const postgresError = error as PostgresError;
    if (
      postgresError.code === "23505" &&
      postgresError.constraint === "account_security_audit_events_pkey"
    ) {
      throw new AuditEventIdentityConflictError();
    }
    throw error;
  }
}

export async function appendControlledOperatorAccountSecurityAuditEvent(
  transaction: PostgresTransaction,
  input: ControlledOperatorAccountSecurityAuditEventInput,
): Promise<string> {
  requireAuditUuid(input.eventId);
  requireAuditEventType(input.eventType);
  if (input.subjectUserId !== null) requireAuditUuid(input.subjectUserId);
  validateAccountSecurityActor(input.actor);
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new Error("Account-security audit occurrence time is invalid.");
  }
  try {
    const result = await transaction.query<{ id: string }>(
      `SELECT append_account_security_audit_event(
         $1::uuid, $2::text, $3::uuid,
         'CONTROLLED_OPERATOR'::account_security_actor_type,
         NULL::uuid, $4::text, $5::timestamptz
       )::text AS id`,
      [
        input.eventId,
        input.eventType,
        input.subjectUserId,
        input.actor.operatorRef,
        input.occurredAt,
      ],
    );
    const id = result.rows[0]?.id;
    if (id !== input.eventId) {
      throw new Error("Account-security audit persistence returned no event.");
    }
    return id;
  } catch (error) {
    const postgresError = error as PostgresError;
    if (
      postgresError.code === "23505" &&
      postgresError.constraint === "account_security_audit_events_pkey"
    ) {
      throw new AuditEventIdentityConflictError();
    }
    throw error;
  }
}
