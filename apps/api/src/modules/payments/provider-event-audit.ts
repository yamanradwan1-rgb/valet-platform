import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { ReconciliationPayment } from "./provider-event-repository";
import type { AuthenticatedProviderEvent } from "./provider-event-types";

export async function appendProviderEventAudit(
  transaction: PostgresTransaction,
  input: {
    readonly event: AuthenticatedProviderEvent;
    readonly idFactory: (() => string) | undefined;
    readonly operationTime: Date;
    readonly payment: ReconciliationPayment;
    readonly subjectId: string;
  },
): Promise<void> {
  const metadata: Record<string, string> = {
    payment_id: input.payment.id,
    provider: input.event.binding.provider,
    result_kind: input.event.event.kind,
  };
  if (input.event.event.subject === "COLLECTION") {
    metadata.operation_id = input.event.event.operationId;
  } else {
    metadata.refund_id = input.event.event.refundId;
  }
  if (input.event.event.safeResultCode !== null) {
    metadata.safe_result_code = input.event.event.safeResultCode;
  }
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, NULL, 'EXTERNAL_PROVIDER',
             $5, $6, $7, $8::jsonb, $9)`,
    [
      input.idFactory?.() ?? randomUUID(),
      input.payment.organizationId,
      input.payment.locationId,
      input.payment.valetSessionId,
      `PROVIDER_EVENT_${input.event.event.kind}`,
      input.event.event.subject === "COLLECTION"
        ? "PaymentCollectionOperation"
        : "Refund",
      input.subjectId,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
}
