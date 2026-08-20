import type { PostgresTransaction } from "../../common/database/postgres";
import { parseMoney } from "./payment-money";
import {
  findCollectionPaymentId,
  isCollectionReferenceOwnedElsewhere,
  lockReconciliationOperation,
  lockReconciliationPayment,
  type ReconciliationOperation,
  type ReconciliationPayment,
} from "./provider-event-repository";
import type {
  AuthenticatedProviderEvent,
  NormalizedCollectionProviderEvent,
} from "./provider-event-types";

export interface CollectionReconciliationDecision {
  readonly authoritative: boolean;
  readonly payment: ReconciliationPayment | null;
  readonly paymentId: string | null;
  readonly subjectId: string | null;
}

function referenceMatches(
  operation: ReconciliationOperation,
  event: NormalizedCollectionProviderEvent,
): boolean {
  return operation.providerReference === null
    ? event.providerReference !== null
    : operation.providerReference === event.providerReference;
}

function paymentCompatible(
  payment: ReconciliationPayment,
  operation: ReconciliationOperation,
  provider: string,
): boolean {
  return (
    payment.collectionMethod === "DIGITAL" &&
    payment.provider === provider &&
    payment.provider === operation.provider &&
    payment.currency === operation.currency &&
    parseMoney(payment.amountDue, true) ===
      parseMoney(operation.amount, true) &&
    parseMoney(payment.amountPaid, true) === 0n &&
    payment.paidAt === null &&
    (payment.providerReference === null ||
      payment.providerReference === operation.providerReference)
  );
}

export async function reconcileCollectionEvent(
  transaction: PostgresTransaction,
  input: {
    readonly authenticated: AuthenticatedProviderEvent;
    readonly event: NormalizedCollectionProviderEvent;
    readonly operationTime: Date;
  },
): Promise<CollectionReconciliationDecision> {
  const paymentId = await findCollectionPaymentId(
    transaction,
    input.authenticated.binding.organizationId,
    input.event.operationId,
  );
  if (paymentId === null) {
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
  const operation = await lockReconciliationOperation(
    transaction,
    payment.organizationId,
    payment.id,
    input.event.operationId,
  );
  if (operation === null) {
    return { authoritative: false, payment, paymentId, subjectId: null };
  }
  const base = { payment, paymentId, subjectId: operation.id };
  if (
    input.event.kind === "NO_FINANCIAL_CHANGE" ||
    !["OUTCOME_UNKNOWN", "REFERENCE_ATTACHED"].includes(operation.state) ||
    operation.provider !== input.authenticated.binding.provider ||
    !referenceMatches(operation, input.event) ||
    !paymentCompatible(
      payment,
      operation,
      input.authenticated.binding.provider,
    ) ||
    !["UNPAID", "FAILED"].includes(payment.status)
  ) {
    return { ...base, authoritative: false };
  }
  const reference = input.event.providerReference;
  if (reference === null) return { ...base, authoritative: false };
  if (
    await isCollectionReferenceOwnedElsewhere(transaction, {
      operationId: operation.id,
      organizationId: payment.organizationId,
      paymentId: payment.id,
      provider: operation.provider,
      providerReference: reference,
    })
  ) {
    return { ...base, authoritative: false };
  }
  const state = await transaction.query(
    `UPDATE payment_collection_operations
     SET state = 'RESOLVED', provider_reference = $4,
         safe_result_code = $5, resolved_at = $6, updated_at = $6
     WHERE organization_id = $1 AND payment_id = $2 AND id = $3
       AND state IN ('OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')
       AND provider = $7
       AND (provider_reference IS NULL OR provider_reference = $4)`,
    [
      payment.organizationId,
      payment.id,
      operation.id,
      reference,
      input.event.safeResultCode,
      input.operationTime,
      operation.provider,
    ],
  );
  if (state.rowCount !== 1) return { ...base, authoritative: false };
  const success = input.event.kind === "COLLECTION_SUCCEEDED";
  const projection = await transaction.query(
    `UPDATE payments
     SET status = $3::payment_status,
         amount_paid = CASE WHEN $3 = 'PAID' THEN amount_due ELSE 0 END,
         paid_at = CASE WHEN $3::payment_status = 'PAID'
                        THEN $5::timestamptz ELSE NULL END,
         provider_reference = $4, updated_at = $5
     WHERE organization_id = $1 AND id = $2
       AND collection_method = 'DIGITAL' AND provider = $6
       AND status IN ('UNPAID', 'FAILED') AND amount_paid = 0
       AND paid_at IS NULL`,
    [
      payment.organizationId,
      payment.id,
      success ? "PAID" : "FAILED",
      reference,
      input.operationTime,
      operation.provider,
    ],
  );
  if (projection.rowCount !== 1)
    throw new Error("collection projection conflict");
  return { ...base, authoritative: true };
}
