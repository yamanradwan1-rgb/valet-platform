import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { MutablePayment } from "./payment-mutation-types";
import type { CashActor, CashEntryProjection } from "./cash-types";

export async function appendCashMutationAudit(
  transaction: PostgresTransaction,
  input: {
    actor: CashActor;
    amountPaid: string;
    entry: CashEntryProjection;
    idFactory?: (() => string) | undefined;
    payment: MutablePayment;
    status: "PAID" | "UNPAID";
  },
): Promise<void> {
  const eventType =
    input.entry.type === "RECEIPT"
      ? "PAYMENT_CASH_RECEIVED"
      : input.entry.type === "ADJUSTMENT_INCREASE"
        ? "PAYMENT_CASH_ADJUSTED_INCREASE"
        : "PAYMENT_CASH_ADJUSTED_DECREASE";
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'CashEntry', $7, $8::jsonb, $9)`,
    [
      (input.idFactory ?? randomUUID)(),
      input.payment.organizationId,
      input.payment.locationId,
      input.payment.valetSessionId,
      input.actor.membershipId,
      eventType,
      input.entry.id,
      JSON.stringify({
        amount_due: input.payment.amountDue,
        amount_paid: input.amountPaid,
        cash_entry_amount: input.entry.amount,
        cash_entry_type: input.entry.type,
        currency: input.payment.currency,
        payment_id: input.payment.id,
        status: input.status,
      }),
      input.entry.occurredAt,
    ],
  );
}
