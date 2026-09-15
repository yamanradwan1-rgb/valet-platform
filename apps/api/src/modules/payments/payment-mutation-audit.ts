import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { FinancialActor, MutablePayment } from "./payment-mutation-types";

export async function appendFinancialMutationAudit(
  transaction: PostgresTransaction,
  input: {
    actor: FinancialActor;
    entityId?: string;
    entityType?: "Payment" | "Validation";
    eventType: string;
    idFactory?: (() => string) | undefined;
    metadata: Readonly<Record<string, unknown>>;
    operationTime: Date;
    payment: MutablePayment;
  },
): Promise<void> {
  const metadata = {
    ...(input.actor.actorClass === "GUEST" ? { actor_class: "GUEST" } : {}),
    currency: input.payment.currency,
    payment_id: input.payment.id,
    ...input.metadata,
  };
  const actorType =
    input.actor.actorClass === "GUEST" ? "GUEST" : "MEMBERSHIP";
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6::audit_actor_type,
             $7, $8, $9, $10::jsonb, $11)`,
    [
      (input.idFactory ?? randomUUID)(),
      input.payment.organizationId,
      input.payment.locationId,
      input.payment.valetSessionId,
      input.actor.membershipId,
      actorType,
      input.eventType,
      input.entityType ?? "Payment",
      input.entityId ?? input.payment.id,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
}
