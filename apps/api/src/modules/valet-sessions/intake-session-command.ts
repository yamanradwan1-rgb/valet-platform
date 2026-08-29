import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

import type { PostgresPool } from "../../common/database/postgres";
import { authorizeCheckInLocation } from "../check-in-api/check-in-location-authorization";
import { resolveIntakeCustomer } from "./intake-customer-resolution";
import {
  intakeRequestFingerprint,
  normalizeIntakeRequest,
  type NormalizedIntakeRequest,
} from "./intake-session-normalization";
import {
  IntakeSessionCommandError,
  type IntakeSessionCommandOptions,
  type IntakeSessionCommandRequest,
  type IntakeSessionCommandResult,
} from "./intake-session-types";
import {
  insertIntakeSession,
  intakeResultFromRow,
  loadExistingIntakeOperation,
} from "./intake-session-persistence";
import { createOrResolveIntakeVehicle } from "./intake-vehicle-resolution";

export {
  IntakeSessionCommandError,
  type IntakeCustomerInput,
  type IntakeSessionCommandErrorCode,
  type IntakeSessionCommandRequest,
  type IntakeSessionCommandResult,
} from "./intake-session-types";

const maximumSerializationAttempts = 3;

function isDatabaseError(error: unknown, code: string): boolean {
  return (error as Partial<DatabaseError>).code === code;
}

function isActiveSessionConflict(error: unknown): boolean {
  const databaseError = error as Partial<DatabaseError>;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "valet_sessions_active_location_vehicle_key"
  );
}

async function executeOnce(
  pool: PostgresPool,
  normalized: NormalizedIntakeRequest,
  options: IntakeSessionCommandOptions,
): Promise<IntakeSessionCommandResult> {
  const transaction = await pool.connect();
  try {
    await transaction.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const time = await transaction.query<{ operation_time: Date }>(
      `SELECT transaction_timestamp() AS operation_time`,
    );
    const operationTime = time.rows[0]?.operation_time;
    if (operationTime === undefined) {
      throw new Error("Database did not provide an operation timestamp.");
    }

    const scope = await authorizeCheckInLocation(
      transaction,
      normalized.authenticatedUserId,
      normalized.targetLocationId,
    );
    const fingerprint = intakeRequestFingerprint(
      normalized,
      scope.organizationId,
    );
    await transaction.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${scope.organizationId}:${normalized.intakeOperationId}`],
    );
    const existing = await loadExistingIntakeOperation(
      transaction,
      scope.organizationId,
      normalized.intakeOperationId,
    );
    if (existing !== undefined) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new IntakeSessionCommandError("IDEMPOTENCY_CONFLICT");
      }
      await transaction.query("COMMIT");
      return intakeResultFromRow(existing);
    }

    const vehicle = await createOrResolveIntakeVehicle(transaction, {
      details: normalized.vehicleDetails,
      identity: normalized.vehicleIdentity,
      operationTime,
      organizationId: scope.organizationId,
      vehicleId: (options.vehicleIdFactory ?? randomUUID)(),
    });
    const customerId = await resolveIntakeCustomer(transaction, {
      customer: normalized.customer,
      ...(options.customerIdFactory === undefined
        ? {}
        : { customerIdFactory: options.customerIdFactory }),
      identity: normalized.vehicleIdentity,
      operationTime,
      organizationId: scope.organizationId,
      vehicleId: vehicle.id,
    });
    const row = await insertIntakeSession(transaction, {
      customerId,
      fingerprint,
      normalized,
      operationTime,
      options,
      scope,
      vehicle,
    });
    await transaction.query("COMMIT");
    return intakeResultFromRow(row);
  } catch (error) {
    try {
      await transaction.query("ROLLBACK");
    } catch {
      // Preserve the original intake-session command failure.
    }
    if (isActiveSessionConflict(error)) {
      throw new IntakeSessionCommandError("ACTIVE_VALET_SESSION_CONFLICT");
    }
    throw error;
  } finally {
    transaction.release();
  }
}

export function createIntakeSessionCommandExecutor(
  pool: PostgresPool,
  options: IntakeSessionCommandOptions = {},
) {
  return async (
    request: IntakeSessionCommandRequest,
  ): Promise<IntakeSessionCommandResult> => {
    const normalized = normalizeIntakeRequest(request);
    for (
      let attempt = 1;
      attempt <= maximumSerializationAttempts;
      attempt += 1
    ) {
      try {
        return await executeOnce(pool, normalized, options);
      } catch (error) {
        if (!isDatabaseError(error, "40001")) throw error;
        if (attempt === maximumSerializationAttempts) {
          throw new IntakeSessionCommandError("INTAKE_CONCURRENCY_CONFLICT");
        }
      }
    }
    throw new IntakeSessionCommandError("INTAKE_CONCURRENCY_CONFLICT");
  };
}
