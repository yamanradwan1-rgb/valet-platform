import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  DigitalCollectionOperation,
  DigitalCollectionPayment,
} from "./digital-collection-types";

export type DigitalCollectionAuditEvent =
  | "PAYMENT_COLLECTION_PREPARED"
  | "PAYMENT_COLLECTION_DISPATCH_GUARDED"
  | "PAYMENT_COLLECTION_REFERENCE_ATTACHED"
  | "PAYMENT_COLLECTION_REJECTED";

export async function appendDigitalCollectionAudit(
  transaction: PostgresTransaction,
  input: {
    readonly eventType: DigitalCollectionAuditEvent;
    readonly idFactory: (() => string) | undefined;
    readonly operation: DigitalCollectionOperation;
    readonly operationTime: Date;
    readonly payment: DigitalCollectionPayment;
  },
): Promise<void> {
  const metadata: Record<string, string> = {
    operation_id: input.operation.id,
    payment_id: input.payment.id,
    provider: input.operation.provider,
    state: input.operation.state,
  };
  if (input.operation.safeResultCode !== null) {
    metadata.safe_result_code = input.operation.safeResultCode;
  }
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, NULL, 'SYSTEM', $5, 'PaymentCollectionOperation',
             $6, $7::jsonb, $8)`,
    [
      input.idFactory?.() ?? randomUUID(),
      input.payment.organizationId,
      input.payment.locationId,
      input.payment.valetSessionId,
      input.eventType,
      input.operation.id,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
}
