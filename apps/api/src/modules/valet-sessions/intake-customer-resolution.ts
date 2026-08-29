import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { NormalizedVehicleIdentity } from "../vehicles/vehicle-identity-command";
import type { NormalizedIntakeCustomer } from "./intake-session-normalization";
import { IntakeSessionCommandError } from "./intake-session-types";

interface CustomerIdRow {
  customer_id: string;
}

async function resolveSavedCustomer(
  transaction: PostgresTransaction,
  input: {
    readonly customerId: string;
    readonly identity: NormalizedVehicleIdentity;
    readonly organizationId: string;
    readonly vehicleId: string;
  },
): Promise<string> {
  if (input.identity.mode !== "CONFIRMED_PLATE") {
    throw new IntakeSessionCommandError("RETURNING_CUSTOMER_INTENT_INVALID");
  }

  // Locks all current history rows for this Vehicle. A concurrent completion
  // must serialize before or after this final check; SERIALIZABLE intake retry
  // handles rows changed after the transaction snapshot.
  const history = await transaction.query<{
    customer_id: string | null;
    state: string;
  }>(
    `SELECT customer_id::text, state::text
     FROM valet_sessions
     WHERE organization_id = $1
       AND vehicle_id = $2
     FOR UPDATE`,
    [input.organizationId, input.vehicleId],
  );
  const candidates = new Set(
    history.rows
      .filter((row) => row.state === "COMPLETED" && row.customer_id !== null)
      .map((row) => row.customer_id!),
  );
  if (candidates.size !== 1 || !candidates.has(input.customerId)) {
    throw new IntakeSessionCommandError("RETURNING_CUSTOMER_INTENT_INVALID");
  }

  const customer = await transaction.query<CustomerIdRow>(
    `SELECT id::text AS customer_id
     FROM customers
     WHERE organization_id = $1
       AND id = $2
     FOR SHARE`,
    [input.organizationId, input.customerId],
  );
  if (customer.rows[0]?.customer_id !== input.customerId) {
    throw new IntakeSessionCommandError("RETURNING_CUSTOMER_INTENT_INVALID");
  }
  return input.customerId;
}

async function resolveDifferentCustomer(
  transaction: PostgresTransaction,
  input: Extract<NormalizedIntakeCustomer, { intent: "DIFFERENT_CUSTOMER" }>,
  organizationId: string,
  operationTime: Date,
  customerIdFactory: () => string,
): Promise<string> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`${organizationId}:customer-phone:${input.phoneNormalized}`],
  );
  const matches = await transaction.query<CustomerIdRow>(
    `SELECT id::text AS customer_id
     FROM customers
     WHERE organization_id = $1
       AND phone_normalized = $2
     ORDER BY id
     LIMIT 2
     FOR UPDATE`,
    [organizationId, input.phoneNormalized],
  );
  if (matches.rows.length > 1) {
    throw new IntakeSessionCommandError("CUSTOMER_PHONE_AMBIGUOUS");
  }
  const existing = matches.rows[0]?.customer_id;
  if (existing !== undefined) return existing;

  const customerId = customerIdFactory();
  await transaction.query(
    `INSERT INTO customers
       (id, organization_id, phone_normalized, display_name,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [
      customerId,
      organizationId,
      input.phoneNormalized,
      input.displayName,
      operationTime,
    ],
  );
  return customerId;
}

export async function resolveIntakeCustomer(
  transaction: PostgresTransaction,
  input: {
    readonly customer: NormalizedIntakeCustomer | null;
    readonly customerIdFactory?: () => string;
    readonly identity: NormalizedVehicleIdentity;
    readonly operationTime: Date;
    readonly organizationId: string;
    readonly vehicleId: string;
  },
): Promise<string | null> {
  if (input.customer === null) return null;
  if (input.customer.intent === "USE_SAVED_CUSTOMER") {
    return resolveSavedCustomer(transaction, {
      customerId: input.customer.customerId,
      identity: input.identity,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });
  }
  return resolveDifferentCustomer(
    transaction,
    input.customer,
    input.organizationId,
    input.operationTime,
    input.customerIdFactory ?? randomUUID,
  );
}
