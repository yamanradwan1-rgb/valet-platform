import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

type AccountSecurityActor =
  | { readonly type: "USER"; readonly userId: string }
  | { readonly type: "ANONYMOUS" | "CONTROLLED_OPERATOR" | "SYSTEM" };

export interface AccountSecurityAuditEventInput {
  readonly actor: AccountSecurityActor;
  readonly eventId?: string;
  readonly eventType: string;
  readonly idempotencyKey?: string;
  readonly occurredAt: Date;
  readonly requestId?: string;
  readonly subjectUserId?: string;
}

export async function appendAccountSecurityAuditEvent(
  transaction: PostgresTransaction,
  input: AccountSecurityAuditEventInput,
  eventIdFactory: () => string = randomUUID,
): Promise<string> {
  const eventId = input.eventId ?? eventIdFactory();
  await transaction.query(
    `INSERT INTO account_security_audit_events
       (id, subject_user_id, actor_type, actor_user_id, event_type,
        request_id, idempotency_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      input.subjectUserId ?? null,
      input.actor.type,
      input.actor.type === "USER" ? input.actor.userId : null,
      input.eventType,
      input.requestId ?? null,
      input.idempotencyKey ?? null,
      input.occurredAt,
    ],
  );
  return eventId;
}
