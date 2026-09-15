import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { assertOpaqueOperatorReference } from "./actor-operator-reference";

type AccountSecurityActor =
  | { readonly type: "USER"; readonly userId: string }
  | { readonly type: "CONTROLLED_OPERATOR"; readonly operatorRef: string }
  | { readonly type: "ANONYMOUS" | "SYSTEM" };

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
  if (input.actor.type === "CONTROLLED_OPERATOR") {
    assertOpaqueOperatorReference(input.actor.operatorRef);
  }
  const eventId = input.eventId ?? eventIdFactory();
  const result = await transaction.query<{ id: string }>(
    `SELECT append_account_security_audit_event_exact(
       $1, $2, $3, $4, $5, $6, $7, $8, $9
     )::text AS id`,
    [
      eventId,
      input.subjectUserId ?? null,
      input.actor.type,
      input.actor.type === "USER" ? input.actor.userId : null,
      input.actor.type === "CONTROLLED_OPERATOR"
        ? input.actor.operatorRef
        : null,
      input.eventType,
      input.requestId ?? null,
      input.idempotencyKey ?? null,
      input.occurredAt,
    ],
  );
  const persistedId = result.rows[0]?.id;
  if (result.rowCount !== 1 || persistedId === undefined) {
    throw new Error("Account-security audit append did not converge.");
  }
  return persistedId;
}
