import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  AuthenticatedProviderEvent,
  ProviderEventProcessingResult,
} from "./provider-event-types";

export interface ReconciliationPayment {
  readonly amountDue: string;
  readonly amountPaid: string;
  readonly collectionMethod: "NONE" | "CASH" | "DIGITAL";
  readonly currency: string;
  readonly id: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly paidAt: Date | null;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly status: "NOT_REQUIRED" | "UNPAID" | "PENDING" | "PAID" | "FAILED";
  readonly valetSessionId: string;
}

export interface ReconciliationOperation {
  readonly amount: string;
  readonly currency: string;
  readonly id: string;
  readonly paymentId: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly state:
    | "PREPARED"
    | "OUTCOME_UNKNOWN"
    | "REFERENCE_ATTACHED"
    | "REJECTED"
    | "RESOLVED";
}

export interface ReconciliationRefund {
  readonly completedAt: Date | null;
  readonly id: string;
  readonly paymentId: string;
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly status: "PENDING" | "SUCCEEDED" | "FAILED";
}

export async function findCommittedProviderEvent(
  transaction: PostgresTransaction,
  event: AuthenticatedProviderEvent,
): Promise<ProviderEventProcessingResult | null> {
  const result = await transaction.query<{
    id: string;
    processing_status: "PROCESSED" | "IGNORED";
  }>(
    `SELECT id::text, processing_status::text
     FROM payment_provider_events
     WHERE organization_id = $1 AND provider = $2 AND provider_event_id = $3`,
    [
      event.binding.organizationId,
      event.binding.provider,
      event.event.providerEventId,
    ],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        duplicate: true,
        eventId: row.id,
        persisted: true,
        processingStatus: row.processing_status,
      };
}

export async function findCollectionPaymentId(
  transaction: PostgresTransaction,
  organizationId: string,
  operationId: string,
): Promise<string | null> {
  const result = await transaction.query<{ payment_id: string }>(
    `SELECT payment_id::text FROM payment_collection_operations
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, operationId],
  );
  return result.rows[0]?.payment_id ?? null;
}

export async function findRefundPaymentId(
  transaction: PostgresTransaction,
  organizationId: string,
  refundId: string,
): Promise<string | null> {
  const result = await transaction.query<{ payment_id: string }>(
    `SELECT payment_id::text FROM refunds
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, refundId],
  );
  return result.rows[0]?.payment_id ?? null;
}

export async function lockReconciliationSession(
  transaction: PostgresTransaction,
  organizationId: string,
  paymentId: string,
): Promise<boolean> {
  const result = await transaction.query(
    `SELECT session.id
     FROM payments AS payment
     INNER JOIN valet_sessions AS session
       ON session.organization_id = payment.organization_id
      AND session.id = payment.valet_session_id
     WHERE payment.organization_id = $1 AND payment.id = $2
     FOR KEY SHARE OF session`,
    [organizationId, paymentId],
  );
  return result.rowCount === 1;
}

export async function lockReconciliationPayment(
  transaction: PostgresTransaction,
  organizationId: string,
  paymentId: string,
): Promise<ReconciliationPayment | null> {
  const result = await transaction.query<Record<string, unknown>>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, amount_due::text, amount_paid::text,
            collection_method::text, currency, status::text, provider,
            provider_reference, paid_at
     FROM payments WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
    [organizationId, paymentId],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        amountDue: row.amount_due as string,
        amountPaid: row.amount_paid as string,
        collectionMethod:
          row.collection_method as ReconciliationPayment["collectionMethod"],
        currency: row.currency as string,
        id: row.id as string,
        locationId: row.location_id as string,
        organizationId: row.organization_id as string,
        paidAt: row.paid_at as Date | null,
        provider: row.provider as string | null,
        providerReference: row.provider_reference as string | null,
        status: row.status as ReconciliationPayment["status"],
        valetSessionId: row.valet_session_id as string,
      };
}

export async function lockReconciliationOperation(
  transaction: PostgresTransaction,
  organizationId: string,
  paymentId: string,
  operationId: string,
): Promise<ReconciliationOperation | null> {
  const result = await transaction.query<Record<string, unknown>>(
    `SELECT id::text, payment_id::text, amount::text, currency, provider,
            provider_reference, state::text
     FROM payment_collection_operations
     WHERE organization_id = $1 AND payment_id = $2 AND id = $3 FOR UPDATE`,
    [organizationId, paymentId, operationId],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        amount: row.amount as string,
        currency: row.currency as string,
        id: row.id as string,
        paymentId: row.payment_id as string,
        provider: row.provider as string,
        providerReference: row.provider_reference as string | null,
        state: row.state as ReconciliationOperation["state"],
      };
}

export async function isCollectionReferenceOwnedElsewhere(
  transaction: PostgresTransaction,
  input: {
    readonly operationId: string;
    readonly organizationId: string;
    readonly paymentId: string;
    readonly provider: string;
    readonly providerReference: string;
  },
): Promise<boolean> {
  const result = await transaction.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM payment_collection_operations
       WHERE organization_id = $1 AND provider = $2
         AND provider_reference = $3 AND id <> $4
       UNION ALL
       SELECT 1 FROM payments
       WHERE organization_id = $1 AND provider = $2
         AND provider_reference = $3 AND id <> $5
     ) AS present`,
    [
      input.organizationId,
      input.provider,
      input.providerReference,
      input.operationId,
      input.paymentId,
    ],
  );
  return result.rows[0]?.present === true;
}

export async function isRefundReferenceOwnedElsewhere(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly provider: string;
    readonly providerReference: string;
    readonly refundId: string;
  },
): Promise<boolean> {
  const result = await transaction.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM refunds
       WHERE organization_id = $1 AND provider = $2
         AND provider_reference = $3 AND id <> $4
     ) AS present`,
    [
      input.organizationId,
      input.provider,
      input.providerReference,
      input.refundId,
    ],
  );
  return result.rows[0]?.present === true;
}

export async function lockReconciliationRefund(
  transaction: PostgresTransaction,
  organizationId: string,
  paymentId: string,
  refundId: string,
): Promise<ReconciliationRefund | null> {
  const result = await transaction.query<Record<string, unknown>>(
    `SELECT id::text, payment_id::text, status::text, provider,
            provider_reference, completed_at
     FROM refunds
     WHERE organization_id = $1 AND payment_id = $2 AND id = $3 FOR UPDATE`,
    [organizationId, paymentId, refundId],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        completedAt: row.completed_at as Date | null,
        id: row.id as string,
        paymentId: row.payment_id as string,
        provider: row.provider as string | null,
        providerReference: row.provider_reference as string | null,
        status: row.status as ReconciliationRefund["status"],
      };
}

export async function insertProviderEvent(
  transaction: PostgresTransaction,
  input: {
    readonly event: AuthenticatedProviderEvent;
    readonly eventId: string;
    readonly operationTime: Date;
    readonly paymentId: string;
    readonly processingStatus: "PROCESSED" | "IGNORED";
    readonly refundId: string | null;
  },
): Promise<void> {
  await transaction.query(
    `INSERT INTO payment_provider_events
       (id, organization_id, payment_id, refund_id, provider,
        provider_event_id, provider_reference, processing_status,
        received_at, processed_at, safe_result_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)`,
    [
      input.eventId,
      input.event.binding.organizationId,
      input.paymentId,
      input.refundId,
      input.event.binding.provider,
      input.event.event.providerEventId,
      input.event.event.providerReference,
      input.processingStatus,
      input.operationTime,
      input.event.event.safeResultCode,
    ],
  );
}
