import type { PostgresTransaction } from "../../common/database/postgres";
import { DigitalCollectionError } from "./digital-collection-errors";
import {
  findOperationById,
  operationColumns,
  operationFromRow,
} from "./digital-collection-repository";
import type {
  DigitalCollectionOperation,
  DigitalCollectionPayment,
} from "./digital-collection-types";

type OperationRow = Parameters<typeof operationFromRow>[0];

export async function guardDigitalCollectionDispatch(
  transaction: PostgresTransaction,
  input: {
    readonly operation: DigitalCollectionOperation;
    readonly operationTime: Date;
  },
): Promise<{ operation: DigitalCollectionOperation; won: boolean }> {
  const result = await transaction.query<OperationRow>(
    `UPDATE payment_collection_operations
     SET state = 'OUTCOME_UNKNOWN', dispatch_guarded_at = $3, updated_at = $3
     WHERE organization_id = $1 AND id = $2 AND state = 'PREPARED'
     RETURNING ${operationColumns}`,
    [input.operation.organizationId, input.operation.id, input.operationTime],
  );
  const row = result.rows[0];
  if (row !== undefined) return { operation: operationFromRow(row), won: true };
  const canonical = await findOperationById(
    transaction,
    input.operation.organizationId,
    input.operation.id,
  );
  if (canonical === null) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  return { operation: canonical, won: false };
}

export async function attachDigitalCollectionReference(
  transaction: PostgresTransaction,
  input: {
    readonly operation: DigitalCollectionOperation;
    readonly operationTime: Date;
    readonly payment: DigitalCollectionPayment;
    readonly providerReference: string;
    readonly safeResultCode: string | null;
  },
): Promise<DigitalCollectionOperation> {
  const result = await transaction.query<OperationRow>(
    `UPDATE payment_collection_operations
     SET state = 'REFERENCE_ATTACHED', provider_reference = $3,
         safe_result_code = $4, updated_at = $5
     WHERE organization_id = $1 AND id = $2 AND state = 'OUTCOME_UNKNOWN'
     RETURNING ${operationColumns}`,
    [
      input.operation.organizationId,
      input.operation.id,
      input.providerReference,
      input.safeResultCode,
      input.operationTime,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  const payment = await transaction.query(
    `UPDATE payments
     SET provider_reference = $4, updated_at = $5
     WHERE organization_id = $1 AND id = $2
       AND collection_method = 'DIGITAL' AND status = 'UNPAID'
       AND provider = $3 AND amount_paid = 0 AND paid_at IS NULL`,
    [
      input.payment.organizationId,
      input.payment.id,
      input.operation.provider,
      input.providerReference,
      input.operationTime,
    ],
  );
  if (payment.rowCount !== 1) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  return operationFromRow(row);
}

export async function rejectDigitalCollection(
  transaction: PostgresTransaction,
  input: {
    readonly operation: DigitalCollectionOperation;
    readonly operationTime: Date;
    readonly safeResultCode: string | null;
  },
): Promise<DigitalCollectionOperation> {
  const result = await transaction.query<OperationRow>(
    `UPDATE payment_collection_operations
     SET state = 'REJECTED', safe_result_code = $3,
         resolved_at = $4, updated_at = $4
     WHERE organization_id = $1 AND id = $2 AND state = 'OUTCOME_UNKNOWN'
     RETURNING ${operationColumns}`,
    [
      input.operation.organizationId,
      input.operation.id,
      input.safeResultCode,
      input.operationTime,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  return operationFromRow(row);
}
