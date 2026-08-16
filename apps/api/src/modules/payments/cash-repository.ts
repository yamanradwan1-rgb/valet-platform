import type { PostgresTransaction } from "../../common/database/postgres";
import type { MutablePayment } from "./payment-mutation-types";
import type {
  CashEntryProjection,
  CashEntryType,
  CashMutationProjection,
} from "./cash-types";

export interface PersistedCashEntry extends CashEntryProjection {
  readonly actorMembershipId: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly reason: string | null;
}

interface CashEntryRow {
  amount: string;
  entry_type: CashEntryType;
  id: string;
  occurred_at: Date;
  organization_id: string;
  payment_id: string;
  reason: string | null;
  received_or_adjusted_by_membership_id: string;
}

function entryFromRow(row: CashEntryRow): PersistedCashEntry {
  return {
    actorMembershipId: row.received_or_adjusted_by_membership_id,
    amount: row.amount,
    id: row.id,
    occurredAt: row.occurred_at,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    reason: row.reason,
    type: row.entry_type,
  };
}

export async function findCashEntryBySubmissionKey(
  transaction: PostgresTransaction,
  organizationId: string,
  submissionIdempotencyKey: string,
): Promise<PersistedCashEntry | null> {
  const result = await transaction.query<CashEntryRow>(
    `SELECT id::text, organization_id::text, payment_id::text,
            entry_type::text, amount::text,
            received_or_adjusted_by_membership_id::text, reason, occurred_at
     FROM cash_entries
     WHERE organization_id = $1 AND submission_idempotency_key = $2`,
    [organizationId, submissionIdempotencyKey],
  );
  const row = result.rows[0];
  return row === undefined ? null : entryFromRow(row);
}

export async function insertCashEntry(
  transaction: PostgresTransaction,
  input: {
    actorMembershipId: string;
    amount: string;
    id: string;
    operationTime: Date;
    organizationId: string;
    paymentId: string;
    reason: string | null;
    submissionIdempotencyKey: string;
    type: CashEntryType;
  },
): Promise<PersistedCashEntry> {
  const result = await transaction.query<CashEntryRow>(
    `INSERT INTO cash_entries
       (id, organization_id, payment_id, entry_type, amount,
        received_or_adjusted_by_membership_id, reason,
        submission_idempotency_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9)
     RETURNING id::text, organization_id::text, payment_id::text,
       entry_type::text, amount::text,
       received_or_adjusted_by_membership_id::text, reason, occurred_at`,
    [
      input.id,
      input.organizationId,
      input.paymentId,
      input.type,
      input.amount,
      input.actorMembershipId,
      input.reason,
      input.submissionIdempotencyKey,
      input.operationTime,
    ],
  );
  return entryFromRow(result.rows[0]!);
}

export async function cashEntryNet(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<{ readonly hasReceipt: boolean; readonly net: string }> {
  const result = await transaction.query<{
    has_receipt: boolean;
    net: string;
  }>(
    `SELECT bool_or(entry_type = 'RECEIPT') AS has_receipt,
            COALESCE(sum(CASE
              WHEN entry_type = 'ADJUSTMENT_DECREASE' THEN -amount
              ELSE amount END), 0)::text AS net
     FROM cash_entries
     WHERE organization_id = $1 AND payment_id = $2`,
    [payment.organizationId, payment.id],
  );
  return {
    hasReceipt: result.rows[0]?.has_receipt === true,
    net: result.rows[0]?.net ?? "0",
  };
}

export async function lockAttributableActiveShift(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<void> {
  await transaction.query(
    `SELECT shift_row.id
     FROM cash_entries AS receipt
     INNER JOIN shifts AS shift_row
       ON shift_row.organization_id = receipt.organization_id
      AND shift_row.membership_id =
          receipt.received_or_adjusted_by_membership_id
      AND shift_row.location_id = $3
      AND shift_row.status = 'ACTIVE'
      AND receipt.occurred_at >= shift_row.started_at
     WHERE receipt.organization_id = $1 AND receipt.payment_id = $2
       AND receipt.entry_type = 'RECEIPT'
     FOR SHARE OF shift_row`,
    [payment.organizationId, payment.id, payment.locationId],
  );
}

export async function updatePaymentCashProjection(
  transaction: PostgresTransaction,
  input: {
    amountPaid: string;
    operationTime: Date;
    payment: MutablePayment;
    status: "PAID" | "UNPAID";
  },
): Promise<{
  readonly amountPaid: string;
  readonly status: "PAID" | "UNPAID";
}> {
  const result = await transaction.query<{
    amount_paid: string;
    status: "PAID" | "UNPAID";
  }>(
    `UPDATE payments
     SET amount_paid = $2::numeric, status = $3::payment_status,
         paid_at = CASE WHEN $3::payment_status = 'PAID'
                        THEN $4::timestamptz ELSE NULL END,
         updated_at = $4::timestamptz
     WHERE id = $1
     RETURNING amount_paid::text, status::text`,
    [input.payment.id, input.amountPaid, input.status, input.operationTime],
  );
  return {
    amountPaid: result.rows[0]!.amount_paid,
    status: result.rows[0]!.status,
  };
}

export function projectCashMutation(
  payment: MutablePayment,
  entry: CashEntryProjection,
  current: { readonly amountPaid: string; readonly status: "PAID" | "UNPAID" },
): CashMutationProjection {
  return {
    amountDue: payment.amountDue,
    amountPaid: current.amountPaid,
    cashEntry: entry,
    currency: payment.currency,
    status: current.status,
    valetSessionId: payment.valetSessionId,
  };
}
