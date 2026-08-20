import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { MutablePayment } from "./payment-mutation-types";
import type { PersistedRefund } from "./refund-types";

export async function appendRefundAudit(
  transaction: PostgresTransaction,
  input: {
    readonly idFactory?: (() => string) | undefined;
    readonly payment: MutablePayment;
    readonly refund: PersistedRefund;
  },
): Promise<void> {
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'PAYMENT_REFUND_CREATED', 'Refund', $6,
             $7::jsonb, $8)`,
    [
      input.idFactory?.() ?? randomUUID(),
      input.payment.organizationId,
      input.payment.locationId,
      input.payment.valetSessionId,
      input.refund.authorizedByMembershipId,
      input.refund.id,
      JSON.stringify({
        amount: input.refund.amount,
        collection_method: input.payment.collectionMethod,
        currency: input.payment.currency,
        payment_id: input.payment.id,
        refund_id: input.refund.id,
        status: input.refund.status,
      }),
      input.refund.requestedAt,
    ],
  );
}
