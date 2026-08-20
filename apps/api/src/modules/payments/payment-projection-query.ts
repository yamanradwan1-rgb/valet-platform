import type { PostgresTransaction } from "../../common/database/postgres";
import { resolveEffectiveFinancialPolicy } from "./financial-policy-resolver";
import { isPaymentReleaseSatisfied } from "./payment-release-satisfaction";
import type {
  PaymentCollectionMethod,
  PaymentServicePayer,
  PaymentStatus,
} from "./payment-types";
import type {
  ProjectionScope,
  SafePaymentProjection,
  SafeProjectionPayment,
  SafeProjectionRefund,
} from "./payment-projection-types";
import type { RefundStatus } from "./refund-types";

interface PaymentRow {
  readonly amount_due: string;
  readonly amount_paid: string;
  readonly collection_method: PaymentCollectionMethod;
  readonly currency: string;
  readonly id: string;
  readonly paid_at: Date | null;
  readonly provider: string | null;
  readonly provider_reference: string | null;
  readonly service_amount: string;
  readonly service_payer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tip_amount: string;
  readonly updated_at: Date;
}

function paymentFrom(row: PaymentRow): SafeProjectionPayment {
  return {
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    collectionMethod: row.collection_method,
    currency: row.currency,
    currentValidation: null,
    paidAt: row.paid_at,
    paymentId: row.id,
    serviceAmount: row.service_amount,
    servicePayer: row.service_payer,
    status: row.status,
    tipAmount: row.tip_amount,
    updatedAt: row.updated_at,
  };
}

export async function loadSafePaymentProjection(
  transaction: PostgresTransaction,
  scope: ProjectionScope,
): Promise<SafePaymentProjection> {
  await transaction.query(
    `SELECT id FROM valet_sessions
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR SHARE`,
    [scope.valetSessionId, scope.organizationId, scope.locationId],
  );
  const releaseRequiresPayment = (
    await resolveEffectiveFinancialPolicy(transaction, scope)
  ).policy.releaseRequiresPayment;
  const paymentResult = await transaction.query<PaymentRow>(
    `SELECT id::text, service_payer::text, collection_method::text, currency,
            service_amount::text, tip_amount::text, amount_due::text,
            amount_paid::text, status::text, provider, provider_reference,
            paid_at, updated_at
     FROM payments
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3
     FOR SHARE`,
    [scope.organizationId, scope.locationId, scope.valetSessionId],
  );
  const row = paymentResult.rows[0];
  if (row === undefined) {
    return {
      payment: null,
      refunds: [],
      releaseRequiresPayment,
      releaseSatisfied: !releaseRequiresPayment,
    };
  }
  const payment = paymentFrom(row);
  const [validationResult, refundResult] = await Promise.all([
    transaction.query<{ amount: string; mode: "NONE" | "FULL" | "PARTIAL" }>(
      `SELECT amount::text, mode::text FROM validations
       WHERE organization_id = $1 AND payment_id = $2 AND is_current = true`,
      [scope.organizationId, payment.paymentId],
    ),
    transaction.query<{
      amount: string;
      completed_at: Date | null;
      id: string;
      requested_at: Date;
      status: RefundStatus;
    }>(
      `SELECT id::text, amount::text, status::text, requested_at, completed_at
       FROM refunds WHERE organization_id = $1 AND payment_id = $2
       ORDER BY requested_at, id`,
      [scope.organizationId, payment.paymentId],
    ),
  ]);
  const validation = validationResult.rows[0];
  const projectedPayment: SafeProjectionPayment = {
    ...payment,
    currentValidation:
      validation === undefined
        ? null
        : { amount: validation.amount, mode: validation.mode },
  };
  const refunds: SafeProjectionRefund[] = refundResult.rows.map((refund) => ({
    amount: refund.amount,
    completedAt: refund.completed_at,
    refundId: refund.id,
    requestedAt: refund.requested_at,
    status: refund.status,
  }));
  return {
    payment: projectedPayment,
    refunds,
    releaseRequiresPayment,
    releaseSatisfied: isPaymentReleaseSatisfied(releaseRequiresPayment, {
      amountDue: row.amount_due,
      amountPaid: row.amount_paid,
      collectionMethod: row.collection_method,
      paidAt: row.paid_at,
      provider: row.provider,
      providerReference: row.provider_reference,
      status: row.status,
    }),
  };
}
