import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  DigitalCollectionOperation,
  DigitalCollectionOperationState,
  DigitalCollectionPayment,
} from "./digital-collection-types";

interface PaymentRow {
  amount_due: string;
  amount_paid: string;
  collection_method: DigitalCollectionPayment["collectionMethod"];
  currency: string;
  id: string;
  location_id: string;
  organization_id: string;
  provider: string | null;
  provider_reference: string | null;
  status: DigitalCollectionPayment["status"];
  valet_session_id: string;
}

interface OperationRow {
  amount: string;
  created_at: Date;
  currency: string;
  dispatch_guarded_at: Date | null;
  id: string;
  organization_id: string;
  payment_id: string;
  provider: string;
  provider_reference: string | null;
  resolved_at: Date | null;
  safe_result_code: string | null;
  state: DigitalCollectionOperationState;
  submission_idempotency_key: string;
  updated_at: Date;
}

const operationColumns = `
  id::text, organization_id::text, payment_id::text,
  submission_idempotency_key, amount::text, currency, provider, state::text,
  provider_reference, safe_result_code, dispatch_guarded_at, resolved_at,
  created_at, updated_at`;

function paymentFromRow(row: PaymentRow): DigitalCollectionPayment {
  return {
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    collectionMethod: row.collection_method,
    currency: row.currency,
    id: row.id,
    locationId: row.location_id,
    organizationId: row.organization_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    status: row.status,
    valetSessionId: row.valet_session_id,
  };
}

function operationFromRow(row: OperationRow): DigitalCollectionOperation {
  return {
    amount: row.amount,
    createdAt: row.created_at,
    currency: row.currency,
    dispatchGuardedAt: row.dispatch_guarded_at,
    id: row.id,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    resolvedAt: row.resolved_at,
    safeResultCode: row.safe_result_code,
    state: row.state,
    submissionIdempotencyKey: row.submission_idempotency_key,
    updatedAt: row.updated_at,
  };
}

export async function lockDigitalCollectionPayment(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<DigitalCollectionPayment | null> {
  const result = await transaction.query<PaymentRow>(
    `SELECT payment.id::text, payment.organization_id::text,
            payment.location_id::text, payment.valet_session_id::text,
            payment.amount_due::text, payment.amount_paid::text,
            payment.collection_method::text, payment.currency,
            payment.provider, payment.provider_reference,
            payment.status::text
     FROM payments AS payment
     INNER JOIN valet_sessions AS session
       ON session.organization_id = payment.organization_id
      AND session.location_id = payment.location_id
      AND session.id = payment.valet_session_id
     WHERE session.id = $1
     FOR UPDATE OF payment`,
    [valetSessionId],
  );
  const row = result.rows[0];
  return row === undefined ? null : paymentFromRow(row);
}

export async function findOperationBySubmissionKey(
  transaction: PostgresTransaction,
  organizationId: string,
  submissionKey: string,
): Promise<DigitalCollectionOperation | null> {
  const result = await transaction.query<OperationRow>(
    `SELECT ${operationColumns}
     FROM payment_collection_operations
     WHERE organization_id = $1 AND submission_idempotency_key = $2`,
    [organizationId, submissionKey],
  );
  const row = result.rows[0];
  return row === undefined ? null : operationFromRow(row);
}

export async function findOperationById(
  transaction: PostgresTransaction,
  organizationId: string,
  operationId: string,
): Promise<DigitalCollectionOperation | null> {
  const result = await transaction.query<OperationRow>(
    `SELECT ${operationColumns}
     FROM payment_collection_operations
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, operationId],
  );
  const row = result.rows[0];
  return row === undefined ? null : operationFromRow(row);
}

export async function hasExternalCollectionEvidence(
  transaction: PostgresTransaction,
  payment: DigitalCollectionPayment,
): Promise<boolean> {
  const result = await transaction.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM cash_entries
       WHERE organization_id = $1 AND payment_id = $2
     ) OR ($3 <> 'FAILED' AND EXISTS (
       SELECT 1 FROM payment_provider_events
       WHERE organization_id = $1 AND payment_id = $2
         AND processing_status = 'PROCESSED'
     )) AS present`,
    [payment.organizationId, payment.id, payment.status],
  );
  return result.rows[0]?.present === true;
}

export async function findUnresolvedOperation(
  transaction: PostgresTransaction,
  payment: DigitalCollectionPayment,
): Promise<DigitalCollectionOperation | null> {
  const result = await transaction.query<OperationRow>(
    `SELECT ${operationColumns}
     FROM payment_collection_operations
     WHERE organization_id = $1 AND payment_id = $2
       AND state IN ('PREPARED', 'OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')`,
    [payment.organizationId, payment.id],
  );
  const row = result.rows[0];
  return row === undefined ? null : operationFromRow(row);
}

export async function insertPreparedOperation(
  transaction: PostgresTransaction,
  input: {
    readonly id: string;
    readonly operationTime: Date;
    readonly payment: DigitalCollectionPayment;
    readonly provider: string;
    readonly submissionKey: string;
  },
): Promise<DigitalCollectionOperation | null> {
  const result = await transaction.query<OperationRow>(
    `INSERT INTO payment_collection_operations
       (id, organization_id, payment_id, submission_idempotency_key,
        amount, currency, provider, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, 'PREPARED', $8, $8)
     ON CONFLICT DO NOTHING
     RETURNING ${operationColumns}`,
    [
      input.id,
      input.payment.organizationId,
      input.payment.id,
      input.submissionKey,
      input.payment.amountDue,
      input.payment.currency,
      input.provider,
      input.operationTime,
    ],
  );
  const row = result.rows[0];
  return row === undefined ? null : operationFromRow(row);
}

export async function projectPreparedPayment(
  transaction: PostgresTransaction,
  payment: DigitalCollectionPayment,
  provider: string,
  operationTime: Date,
): Promise<boolean> {
  const result = await transaction.query(
    `UPDATE payments
     SET collection_method = 'DIGITAL', status = 'UNPAID', provider = $3,
         provider_reference = NULL, amount_paid = 0, paid_at = NULL,
         updated_at = $4
     WHERE organization_id = $1 AND id = $2
       AND status IN ('UNPAID', 'FAILED')
       AND amount_paid = 0 AND amount_due > 0`,
    [payment.organizationId, payment.id, provider, operationTime],
  );
  return result.rowCount === 1;
}

export { operationColumns, operationFromRow };
