import type { PostgresTransaction } from "../../common/database/postgres";
import { PaymentInitializationError } from "./payment-errors";
import type {
  PaymentCollectionMethod,
  PaymentProjection,
  PaymentServicePayer,
  PaymentStatus,
} from "./payment-types";

export interface LockedPaymentSessionScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}

interface SessionScopeRow {
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
}

interface PaymentRow {
  readonly amount_due: string;
  readonly amount_paid: string;
  readonly collection_method: PaymentCollectionMethod;
  readonly created_at: Date;
  readonly creation_idempotency_key: string;
  readonly currency: string;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly paid_at: Date | null;
  readonly provider: string | null;
  readonly provider_reference: string | null;
  readonly service_amount: string;
  readonly service_payer: PaymentServicePayer;
  readonly status: PaymentStatus;
  readonly tip_amount: string;
  readonly updated_at: Date;
  readonly valet_session_id: string;
}

const paymentProjectionColumns = `
  id::text, organization_id::text, location_id::text,
  valet_session_id::text, service_payer::text, collection_method::text,
  currency, service_amount::text, tip_amount::text, amount_due::text,
  amount_paid::text, status::text, creation_idempotency_key, provider,
  provider_reference, created_at, updated_at, paid_at`;

function projectPayment(row: PaymentRow): PaymentProjection {
  return {
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    collectionMethod: row.collection_method,
    createdAt: row.created_at,
    creationIdempotencyKey: row.creation_idempotency_key,
    currency: row.currency,
    id: row.id,
    locationId: row.location_id,
    organizationId: row.organization_id,
    paidAt: row.paid_at,
    provider: row.provider,
    providerReference: row.provider_reference,
    serviceAmount: row.service_amount,
    servicePayer: row.service_payer,
    status: row.status,
    tipAmount: row.tip_amount,
    updatedAt: row.updated_at,
    valetSessionId: row.valet_session_id,
  };
}

export async function lockPaymentSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<LockedPaymentSessionScope> {
  const result = await transaction.query<SessionScopeRow>(
    `SELECT id::text, organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1
     FOR UPDATE`,
    [valetSessionId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new PaymentInitializationError("PAYMENT_SCOPE_NOT_FOUND");
  }
  return {
    locationId: row.location_id,
    organizationId: row.organization_id,
    valetSessionId: row.id,
  };
}

export async function assertCreationKeyAvailableForSession(
  transaction: PostgresTransaction,
  scope: LockedPaymentSessionScope,
  creationIdempotencyKey: string,
): Promise<void> {
  const result = await transaction.query<{ valet_session_id: string }>(
    `SELECT valet_session_id::text
     FROM payments
     WHERE organization_id = $1 AND creation_idempotency_key = $2`,
    [scope.organizationId, creationIdempotencyKey],
  );
  const owner = result.rows[0]?.valet_session_id;
  if (owner !== undefined && owner !== scope.valetSessionId) {
    throw new PaymentInitializationError(
      "PAYMENT_CREATION_IDEMPOTENCY_CONFLICT",
    );
  }
}

export async function findCanonicalPayment(
  transaction: PostgresTransaction,
  scope: LockedPaymentSessionScope,
): Promise<PaymentProjection | null> {
  const result = await transaction.query<PaymentRow>(
    `SELECT ${paymentProjectionColumns}
     FROM payments
     WHERE organization_id = $1 AND valet_session_id = $2`,
    [scope.organizationId, scope.valetSessionId],
  );
  const row = result.rows[0];
  return row === undefined ? null : projectPayment(row);
}

export async function insertCanonicalPayment(
  transaction: PostgresTransaction,
  input: {
    readonly amountDue: string;
    readonly collectionMethod: PaymentCollectionMethod;
    readonly creationIdempotencyKey: string;
    readonly currency: string;
    readonly id: string;
    readonly operationTime: Date;
    readonly scope: LockedPaymentSessionScope;
    readonly serviceAmount: string;
    readonly servicePayer: PaymentServicePayer;
    readonly status: PaymentStatus;
  },
): Promise<PaymentProjection> {
  const result = await transaction.query<PaymentRow>(
    `INSERT INTO payments
       (id, organization_id, location_id, valet_session_id, service_payer,
        collection_method, currency, service_amount, tip_amount, amount_due,
        amount_paid, status, creation_idempotency_key, provider,
        provider_reference, created_at, updated_at, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, 0, $9::numeric,
             0, $10, $11, NULL, NULL, $12, $12, NULL)
     RETURNING ${paymentProjectionColumns}`,
    [
      input.id,
      input.scope.organizationId,
      input.scope.locationId,
      input.scope.valetSessionId,
      input.servicePayer,
      input.collectionMethod,
      input.currency,
      input.serviceAmount,
      input.amountDue,
      input.status,
      input.creationIdempotencyKey,
      input.operationTime,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Payment insert returned no row.");
  return projectPayment(row);
}
