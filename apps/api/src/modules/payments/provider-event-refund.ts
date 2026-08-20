import type { PostgresTransaction } from "../../common/database/postgres";
import {
  findRefundPaymentId,
  isRefundReferenceOwnedElsewhere,
  lockReconciliationPayment,
  lockReconciliationRefund,
  lockReconciliationSession,
  type ReconciliationPayment,
} from "./provider-event-repository";
import type {
  AuthenticatedProviderEvent,
  NormalizedRefundProviderEvent,
} from "./provider-event-types";

export interface RefundReconciliationDecision {
  readonly authoritative: boolean;
  readonly payment: ReconciliationPayment | null;
  readonly paymentId: string | null;
  readonly subjectId: string | null;
}

export async function reconcileRefundEvent(
  transaction: PostgresTransaction,
  input: {
    readonly authenticated: AuthenticatedProviderEvent;
    readonly event: NormalizedRefundProviderEvent;
    readonly operationTime: Date;
  },
): Promise<RefundReconciliationDecision> {
  const paymentId = await findRefundPaymentId(
    transaction,
    input.authenticated.binding.organizationId,
    input.event.refundId,
  );
  if (paymentId === null) {
    return {
      authoritative: false,
      payment: null,
      paymentId: null,
      subjectId: null,
    };
  }
  if (
    !(await lockReconciliationSession(
      transaction,
      input.authenticated.binding.organizationId,
      paymentId,
    ))
  ) {
    return {
      authoritative: false,
      payment: null,
      paymentId: null,
      subjectId: null,
    };
  }
  const payment = await lockReconciliationPayment(
    transaction,
    input.authenticated.binding.organizationId,
    paymentId,
  );
  if (payment === null) {
    return {
      authoritative: false,
      payment: null,
      paymentId: null,
      subjectId: null,
    };
  }
  const refund = await lockReconciliationRefund(
    transaction,
    payment.organizationId,
    payment.id,
    input.event.refundId,
  );
  const base = { payment, paymentId, subjectId: refund?.id ?? null };
  if (
    refund === null ||
    refund.status !== "PENDING" ||
    refund.completedAt !== null ||
    refund.provider !== input.authenticated.binding.provider ||
    (refund.providerReference !== null &&
      refund.providerReference !== input.event.providerReference)
  ) {
    return { ...base, authoritative: false };
  }
  const success = input.event.kind === "REFUND_SUCCEEDED";
  if (success && input.event.providerReference === null) {
    return { ...base, authoritative: false };
  }
  if (
    input.event.providerReference !== null &&
    (await isRefundReferenceOwnedElsewhere(transaction, {
      organizationId: payment.organizationId,
      provider: input.authenticated.binding.provider,
      providerReference: input.event.providerReference,
      refundId: refund.id,
    }))
  ) {
    return { ...base, authoritative: false };
  }
  const updated = await transaction.query(
    `UPDATE refunds
     SET status = $4::refund_status,
         provider_reference = COALESCE(provider_reference, $5),
         completed_at = CASE WHEN $4::refund_status = 'SUCCEEDED'
                             THEN $6::timestamptz ELSE NULL END
     WHERE organization_id = $1 AND payment_id = $2 AND id = $3
       AND status = 'PENDING' AND provider = $7
       AND completed_at IS NULL
       AND (provider_reference IS NULL OR provider_reference = $5)`,
    [
      payment.organizationId,
      payment.id,
      refund.id,
      success ? "SUCCEEDED" : "FAILED",
      input.event.providerReference,
      input.operationTime,
      refund.provider,
    ],
  );
  return { ...base, authoritative: updated.rowCount === 1 };
}
