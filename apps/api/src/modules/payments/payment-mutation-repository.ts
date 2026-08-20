import type { PostgresTransaction } from "../../common/database/postgres";
import { FinancialMutationError } from "./payment-mutation-errors";
import type {
  MutablePayment,
  PaymentMutationProjection,
  PaymentScope,
  RecomputedPayment,
  ValidationMode,
  ValidationProjection,
} from "./payment-mutation-types";
import type {
  PaymentCollectionMethod,
  PaymentServicePayer,
  PaymentStatus,
} from "./payment-types";

interface PaymentRow {
  amount_due: string;
  amount_paid: string;
  collection_method: PaymentCollectionMethod;
  currency: string;
  id: string;
  location_id: string;
  organization_id: string;
  paid_at: Date | null;
  provider: string | null;
  provider_reference: string | null;
  service_amount: string;
  service_payer: PaymentServicePayer;
  status: PaymentStatus;
  tip_amount: string;
  updated_at: Date;
  valet_session_id: string;
}

interface ValidationRow {
  amount: string;
  id: string;
  is_current: boolean;
  mode: ValidationMode;
  supersedes_validation_id: string | null;
}

function paymentFromRow(row: PaymentRow): MutablePayment {
  return {
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    collectionMethod: row.collection_method,
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

export async function lockCanonicalPayment(
  transaction: PostgresTransaction,
  scope: PaymentScope,
): Promise<MutablePayment> {
  const result = await transaction.query<PaymentRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, service_payer::text,
            collection_method::text, currency, service_amount::text,
            tip_amount::text, amount_due::text, amount_paid::text,
            status::text, provider, provider_reference, paid_at, updated_at
     FROM payments
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3
     FOR UPDATE`,
    [scope.organizationId, scope.locationId, scope.valetSessionId],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new FinancialMutationError("PAYMENT_NOT_AVAILABLE");
  return paymentFromRow(row);
}

export async function lockValidationHistory(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<readonly ValidationProjection[]> {
  const result = await transaction.query<ValidationRow>(
    `SELECT id::text, mode::text, amount::text, is_current,
            supersedes_validation_id::text
     FROM validations
     WHERE organization_id = $1 AND payment_id = $2
     ORDER BY applied_at, id
     FOR UPDATE`,
    [payment.organizationId, payment.id],
  );
  return result.rows.map((row) => ({
    amount: row.amount,
    id: row.id,
    isCurrent: row.is_current,
    mode: row.mode,
    supersedesValidationId: row.supersedes_validation_id,
  }));
}

export async function hasCollectionEvidence(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<boolean> {
  const result = await transaction.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM cash_entries
       WHERE organization_id = $1 AND payment_id = $2
     ) OR EXISTS (
       SELECT 1 FROM payment_provider_events
       WHERE organization_id = $1 AND payment_id = $2
     ) OR EXISTS (
       SELECT 1 FROM payment_collection_operations
       WHERE organization_id = $1 AND payment_id = $2
     ) AS present`,
    [payment.organizationId, payment.id],
  );
  return result.rows[0]?.present === true;
}

export async function insertValidation(
  transaction: PostgresTransaction,
  input: {
    amount: string;
    id: string;
    membershipId: string;
    mode: ValidationMode;
    operationTime: Date;
    payment: MutablePayment;
    supersedes: ValidationProjection | null;
  },
): Promise<ValidationProjection> {
  if (input.supersedes !== null) {
    await transaction.query(
      `UPDATE validations SET is_current = false
       WHERE organization_id = $1 AND payment_id = $2
         AND id = $3 AND is_current = true`,
      [input.payment.organizationId, input.payment.id, input.supersedes.id],
    );
  }
  const result = await transaction.query<ValidationRow>(
    `INSERT INTO validations
       (id, organization_id, payment_id, mode, amount, is_current,
        supersedes_validation_id, applied_by_membership_id, applied_at)
     VALUES ($1, $2, $3, $4, $5::numeric, true, $6, $7, $8)
     RETURNING id::text, mode::text, amount::text, is_current,
               supersedes_validation_id::text`,
    [
      input.id,
      input.payment.organizationId,
      input.payment.id,
      input.mode,
      input.amount,
      input.supersedes?.id ?? null,
      input.membershipId,
      input.operationTime,
    ],
  );
  const row = result.rows[0]!;
  return {
    amount: row.amount,
    id: row.id,
    isCurrent: row.is_current,
    mode: row.mode,
    supersedesValidationId: row.supersedes_validation_id,
  };
}

export async function updatePaymentTerms(
  transaction: PostgresTransaction,
  input: {
    operationTime: Date;
    payment: MutablePayment;
    recomputed: RecomputedPayment;
    serviceAmount?: string;
    servicePayer?: PaymentServicePayer;
    tipAmount?: string;
  },
): Promise<MutablePayment> {
  const result = await transaction.query<PaymentRow>(
    `UPDATE payments
     SET service_payer = $2, service_amount = $3::numeric,
         tip_amount = $4::numeric, amount_due = $5::numeric,
         collection_method = $6, status = $7, provider = NULL,
         provider_reference = NULL, paid_at = NULL, updated_at = $8
     WHERE id = $1
     RETURNING id::text, organization_id::text, location_id::text,
       valet_session_id::text, service_payer::text, collection_method::text,
       currency, service_amount::text, tip_amount::text, amount_due::text,
       amount_paid::text, status::text, provider, provider_reference,
       paid_at, updated_at`,
    [
      input.payment.id,
      input.servicePayer ?? input.payment.servicePayer,
      input.serviceAmount ?? input.payment.serviceAmount,
      input.tipAmount ?? input.payment.tipAmount,
      input.recomputed.amountDue,
      input.recomputed.collectionMethod,
      input.recomputed.status,
      input.operationTime,
    ],
  );
  return paymentFromRow(result.rows[0]!);
}

export function projectMutation(
  payment: MutablePayment,
  currentValidation: ValidationProjection | null,
): PaymentMutationProjection {
  return {
    amountDue: payment.amountDue,
    collectionMethod: payment.collectionMethod,
    currency: payment.currency,
    currentValidation:
      currentValidation === null
        ? null
        : {
            amount: currentValidation.amount,
            id: currentValidation.id,
            mode: currentValidation.mode,
          },
    serviceAmount: payment.serviceAmount,
    servicePayer: payment.servicePayer,
    status: payment.status,
    tipAmount: payment.tipAmount,
    updatedAt: payment.updatedAt,
    valetSessionId: payment.valetSessionId,
  };
}
