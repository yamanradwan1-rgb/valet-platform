import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { PaymentProjection } from "./payment-types";

export async function appendPaymentInitializedAudit(
  transaction: PostgresTransaction,
  payment: PaymentProjection,
  operationTime: Date,
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata = {
    amount_due: payment.amountDue,
    collection_method: payment.collectionMethod,
    currency: payment.currency,
    payment_id: payment.id,
    service_amount: payment.serviceAmount,
    service_payer: payment.servicePayer,
    status: payment.status,
    tip_amount: payment.tipAmount,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, NULL, 'SYSTEM', 'PAYMENT_INITIALIZED', 'Payment', $5,
             $6::jsonb, $7)`,
    [
      auditEventId,
      payment.organizationId,
      payment.locationId,
      payment.valetSessionId,
      payment.id,
      JSON.stringify(metadata),
      operationTime,
    ],
  );
  return auditEventId;
}
