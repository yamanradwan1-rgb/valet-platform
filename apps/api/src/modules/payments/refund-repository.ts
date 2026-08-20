import type { PostgresTransaction } from "../../common/database/postgres";
import type { MutablePayment } from "./payment-mutation-types";
import type { PersistedRefund, RefundProjection } from "./refund-types";

interface RefundRow {
  amount: string;
  authorized_by_membership_id: string;
  completed_at: Date | null;
  id: string;
  idempotency_key: string;
  organization_id: string;
  payment_id: string;
  provider: string | null;
  provider_reference: string | null;
  reason: string;
  requested_at: Date;
  status: PersistedRefund["status"];
}

function fromRow(row: RefundRow, currency: string): PersistedRefund {
  return {
    amount: row.amount,
    authorizedByMembershipId: row.authorized_by_membership_id,
    completedAt: row.completed_at,
    currency,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    reason: row.reason,
    requestedAt: row.requested_at,
    status: row.status,
  };
}

export async function findRefundByIdempotencyKey(
  transaction: PostgresTransaction,
  organizationId: string,
  idempotencyKey: string,
  currency: string,
): Promise<PersistedRefund | null> {
  const result = await transaction.query<RefundRow>(
    `SELECT id::text, organization_id::text, payment_id::text, amount::text,
            reason, status::text, authorized_by_membership_id::text,
            idempotency_key, provider, provider_reference, requested_at,
            completed_at
     FROM refunds WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, idempotencyKey],
  );
  const row = result.rows[0];
  return row === undefined ? null : fromRow(row, currency);
}

export async function refundableExposure(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<string> {
  const result = await transaction.query<{ exposure: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS exposure
     FROM refunds
     WHERE organization_id = $1 AND payment_id = $2
       AND status IN ('PENDING', 'SUCCEEDED')`,
    [payment.organizationId, payment.id],
  );
  return result.rows[0]?.exposure ?? "0";
}

export async function insertRefund(
  transaction: PostgresTransaction,
  input: {
    amount: string;
    authorizedByMembershipId: string;
    completedAt: Date | null;
    currency: string;
    id: string;
    idempotencyKey: string;
    operationTime: Date;
    organizationId: string;
    paymentId: string;
    provider: string | null;
    reason: string;
    status: PersistedRefund["status"];
  },
): Promise<PersistedRefund> {
  const result = await transaction.query<RefundRow>(
    `INSERT INTO refunds
       (id, organization_id, payment_id, amount, reason, status,
        authorized_by_membership_id, idempotency_key, provider,
        requested_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6::refund_status, $7, $8, $9, $10, $11)
     RETURNING id::text, organization_id::text, payment_id::text, amount::text,
               reason, status::text, authorized_by_membership_id::text,
               idempotency_key, provider, provider_reference, requested_at,
               completed_at`,
    [
      input.id,
      input.organizationId,
      input.paymentId,
      input.amount,
      input.reason,
      input.status,
      input.authorizedByMembershipId,
      input.idempotencyKey,
      input.provider,
      input.operationTime,
      input.completedAt,
    ],
  );
  return fromRow(result.rows[0]!, input.currency);
}

export function projectRefund(refund: PersistedRefund): RefundProjection {
  return {
    amount: refund.amount,
    completedAt: refund.completedAt,
    currency: refund.currency,
    id: refund.id,
    requestedAt: refund.requestedAt,
    status: refund.status,
  };
}
