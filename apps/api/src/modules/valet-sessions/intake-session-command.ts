import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";
import {
  normalizeVehicleIdentityInput,
  type NormalizedVehicleIdentity,
  type VehicleIdentityInput,
} from "../vehicles/vehicle-identity-command";

export type IntakeSessionCommandErrorCode =
  | "ACTIVE_VALET_SESSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INTAKE_INPUT_INVALID";

const errorMessages: Record<IntakeSessionCommandErrorCode, string> = {
  ACTIVE_VALET_SESSION_CONFLICT:
    "The vehicle already has an active valet session at this location.",
  IDEMPOTENCY_CONFLICT:
    "The intake operation identifier was already used for different input.",
  INTAKE_INPUT_INVALID: "The intake session input is invalid.",
};

export class IntakeSessionCommandError extends Error {
  readonly code: IntakeSessionCommandErrorCode;

  constructor(code: IntakeSessionCommandErrorCode) {
    super(errorMessages[code]);
    this.name = "IntakeSessionCommandError";
    this.code = code;
  }
}

export interface IntakeCustomerInput {
  readonly displayName?: string;
  readonly phone: string;
}

export interface IntakeSessionCommandRequest {
  readonly authenticatedUserId: string;
  readonly customer?: IntakeCustomerInput;
  readonly intakeOperationId: string;
  readonly targetLocationId: string;
  readonly vehicleIdentity: VehicleIdentityInput;
}

export interface IntakeSessionCommandResult {
  readonly createdAt: Date;
  readonly customerId: string | null;
  readonly locationId: string;
  readonly organizationId: string;
  readonly state: "CHECKING_IN";
  readonly valetSessionId: string;
  readonly vehicleId: string;
  readonly version: 1;
}

interface NormalizedCustomerInput {
  displayName: string | null;
  phoneNormalized: string;
}

interface NormalizedIntakeRequest {
  authenticatedUserId: string;
  customer: NormalizedCustomerInput | null;
  intakeOperationId: string;
  targetLocationId: string;
  vehicleIdentity: NormalizedVehicleIdentity;
}

interface IntakeResultRow {
  created_at: Date;
  customer_id: string | null;
  location_id: string;
  organization_id: string;
  request_fingerprint: string;
  valet_session_id: string;
  vehicle_id: string;
}

interface CreatedVehicleRow {
  id: string;
  plate_country: string | null;
  plate_number_normalized: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}

interface IntakeSessionCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly customerIdFactory?: () => string;
  readonly disabledGuestEntropyFactory?: () => Buffer;
  readonly sessionIdFactory?: () => string;
  readonly vehicleIdFactory?: () => string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operationKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const e164Pattern = /^\+[1-9][0-9]{1,14}$/;
const phonePresentationPattern = /[\s().\p{Pd}]+/gu;
const displayNameMaximumCodePoints = 120;

function invalidInput(): never {
  throw new IntakeSessionCommandError("INTAKE_INPUT_INVALID");
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function assertOnlyKeys(value: object, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    invalidInput();
  }
}

function normalizeUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return invalidInput();
  }
  return value.toLowerCase();
}

function normalizeOperationKey(value: unknown): string {
  if (typeof value !== "string") return invalidInput();
  const normalized = value.trim().normalize("NFKC");
  if (!operationKeyPattern.test(normalized)) return invalidInput();
  return normalized;
}

function normalizeCustomer(value: unknown): NormalizedCustomerInput | null {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return invalidInput();
  assertOnlyKeys(value, ["displayName", "phone"]);
  const input = value as Partial<IntakeCustomerInput>;
  if (typeof input.phone !== "string") return invalidInput();
  const phoneNormalized = input.phone
    .trim()
    .normalize("NFKC")
    .replace(phonePresentationPattern, "");
  if (!e164Pattern.test(phoneNormalized)) return invalidInput();

  let displayName: string | null = null;
  if (input.displayName !== undefined) {
    if (typeof input.displayName !== "string") return invalidInput();
    displayName = input.displayName.trim().normalize("NFKC");
    if (
      displayName === "" ||
      codePointLength(displayName) > displayNameMaximumCodePoints
    ) {
      return invalidInput();
    }
  }
  return { displayName, phoneNormalized };
}

function normalizeRequest(
  request: IntakeSessionCommandRequest,
): NormalizedIntakeRequest {
  if (request === null || typeof request !== "object") return invalidInput();
  assertOnlyKeys(request, [
    "authenticatedUserId",
    "customer",
    "intakeOperationId",
    "targetLocationId",
    "vehicleIdentity",
  ]);
  return {
    authenticatedUserId: normalizeUuid(request.authenticatedUserId),
    customer: normalizeCustomer(request.customer),
    intakeOperationId: normalizeOperationKey(request.intakeOperationId),
    targetLocationId: normalizeUuid(request.targetLocationId),
    vehicleIdentity: normalizeVehicleIdentityInput(request.vehicleIdentity),
  };
}

function requestFingerprint(
  request: NormalizedIntakeRequest,
  organizationId: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actorUserId: request.authenticatedUserId,
        customer: request.customer,
        locationId: request.targetLocationId,
        organizationId,
        vehicleIdentity: request.vehicleIdentity,
      }),
    )
    .digest("hex");
}

function disabledGuestAccessHash(entropy: Buffer): string {
  return `disabled:intake:${createHash("sha256").update(entropy).digest("hex")}`;
}

async function loadLocationOrganization(
  transaction: PostgresTransaction,
  locationId: string,
): Promise<string> {
  const result = await transaction.query<{ organization_id: string }>(
    `SELECT organization_id::text
     FROM locations
     WHERE id = $1`,
    [locationId],
  );
  const organizationId = result.rows[0]?.organization_id;
  if (organizationId === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return organizationId;
}

async function loadExistingOperation(
  transaction: PostgresTransaction,
  organizationId: string,
  operationKey: string,
): Promise<IntakeResultRow | undefined> {
  const result = await transaction.query<IntakeResultRow>(
    `SELECT operation.request_fingerprint,
            session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            session.vehicle_id::text, session.customer_id::text,
            session.created_at
     FROM intake_operations AS operation
     INNER JOIN valet_sessions AS session
       ON session.organization_id = operation.organization_id
      AND session.location_id = operation.location_id
      AND session.id = operation.valet_session_id
     INNER JOIN vehicles AS vehicle
       ON vehicle.organization_id = session.organization_id
      AND vehicle.id = session.vehicle_id
     WHERE operation.organization_id = $1
       AND operation.operation_key = $2`,
    [organizationId, operationKey],
  );
  return result.rows[0];
}

async function createOrResolveVehicle(
  transaction: PostgresTransaction,
  organizationId: string,
  identity: NormalizedVehicleIdentity,
  operationTime: Date,
  vehicleIdFactory: () => string,
): Promise<CreatedVehicleRow> {
  const vehicleId = vehicleIdFactory();
  if (identity.mode === "TEMPORARY_DESCRIPTOR") {
    const result = await transaction.query<CreatedVehicleRow>(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id::text, plate_country, plate_number_raw,
                 plate_number_normalized, temporary_descriptor`,
      [vehicleId, organizationId, identity.temporaryDescriptor, operationTime],
    );
    return result.rows[0]!;
  }

  const inserted = await transaction.query<CreatedVehicleRow>(
    `INSERT INTO vehicles
       (id, organization_id, plate_country, plate_number_raw,
        plate_number_normalized, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (organization_id, plate_country, plate_number_normalized)
       WHERE plate_number_normalized IS NOT NULL
     DO NOTHING
     RETURNING id::text, plate_country, plate_number_raw,
               plate_number_normalized, temporary_descriptor`,
    [
      vehicleId,
      organizationId,
      identity.plateCountry,
      identity.plateNumberRaw,
      identity.plateNumberNormalized,
      operationTime,
    ],
  );
  if (inserted.rows[0] !== undefined) return inserted.rows[0];

  const existing = await transaction.query<CreatedVehicleRow>(
    `SELECT id::text, plate_country, plate_number_raw,
            plate_number_normalized, temporary_descriptor
     FROM vehicles
     WHERE organization_id = $1
       AND plate_country = $2
       AND plate_number_normalized = $3`,
    [organizationId, identity.plateCountry, identity.plateNumberNormalized],
  );
  const vehicle = existing.rows[0];
  if (vehicle === undefined) {
    throw new Error("Known vehicle identity could not be resolved.");
  }
  return vehicle;
}

function resultFromRow(
  row: IntakeResultRow,
): IntakeSessionCommandResult {
  return {
    createdAt: row.created_at,
    customerId: row.customer_id,
    locationId: row.location_id,
    organizationId: row.organization_id,
    state: "CHECKING_IN",
    valetSessionId: row.valet_session_id,
    vehicleId: row.vehicle_id,
    version: 1,
  };
}

function isActiveSessionConflict(error: unknown): boolean {
  const databaseError = error as Partial<DatabaseError>;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "valet_sessions_active_location_vehicle_key"
  );
}

export function createIntakeSessionCommandExecutor(
  pool: PostgresPool,
  options: IntakeSessionCommandOptions = {},
): (
  request: IntakeSessionCommandRequest,
) => Promise<IntakeSessionCommandResult> {
  return async (request) => {
    const normalized = normalizeRequest(request);
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      const timeResult = await transaction.query<{ operation_time: Date }>(
        `SELECT transaction_timestamp() AS operation_time`,
      );
      const operationTime = timeResult.rows[0]?.operation_time;
      if (operationTime === undefined) {
        throw new Error("Database did not provide an operation timestamp.");
      }

      await requireActiveCustodyUser(
        transaction,
        normalized.authenticatedUserId,
      );
      const organizationId = await loadLocationOrganization(
        transaction,
        normalized.targetLocationId,
      );
      const actor = await authorizeCustodyActorForPersistedScope(transaction, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: normalized.authenticatedUserId,
        resourceScope: {
          locationId: normalized.targetLocationId,
          organizationId,
        },
      });
      const fingerprint = requestFingerprint(normalized, organizationId);

      await transaction.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${organizationId}:${normalized.intakeOperationId}`],
      );
      const existing = await loadExistingOperation(
        transaction,
        organizationId,
        normalized.intakeOperationId,
      );
      if (existing !== undefined) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new IntakeSessionCommandError("IDEMPOTENCY_CONFLICT");
        }
        await transaction.query("COMMIT");
        return resultFromRow(existing);
      }

      let customerId: string | null = null;
      if (normalized.customer !== null) {
        customerId = (options.customerIdFactory ?? randomUUID)();
        await transaction.query(
          `INSERT INTO customers
             (id, organization_id, phone_normalized, display_name,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [
            customerId,
            organizationId,
            normalized.customer.phoneNormalized,
            normalized.customer.displayName,
            operationTime,
          ],
        );
      }

      const vehicle = await createOrResolveVehicle(
        transaction,
        organizationId,
        normalized.vehicleIdentity,
        operationTime,
        options.vehicleIdFactory ?? randomUUID,
      );
      const valetSessionId = (options.sessionIdFactory ?? randomUUID)();
      const guestAccessHash = disabledGuestAccessHash(
        (options.disabledGuestEntropyFactory ?? (() => randomBytes(32)))(),
      );
      const sessionResult = await transaction.query<IntakeResultRow>(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            customer_access_revoked_at, organization_id, location_id,
            vehicle_id, customer_id, state, checked_in_by_membership_id,
            created_at, version, updated_at)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'CHECKING_IN', $8,
                 $3, 1, $3)
         RETURNING id::text AS valet_session_id, organization_id::text,
                   location_id::text, vehicle_id::text, customer_id::text,
                   created_at, $9::text AS request_fingerprint`,
        [
          valetSessionId,
          guestAccessHash,
          operationTime,
          organizationId,
          normalized.targetLocationId,
          vehicle.id,
          customerId,
          actor.membershipId,
          fingerprint,
        ],
      );
      const session = sessionResult.rows[0];
      if (session === undefined) {
        throw new Error("Intake session creation returned no session.");
      }

      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "VALET_SESSION_CREATED",
            metadata: {
              customerPresent: customerId !== null,
              identityMode: normalized.vehicleIdentity.mode,
              intakeContractVersion: "V1",
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId: actor.membershipId,
            locationId: normalized.targetLocationId,
            organizationId,
            valetSessionId,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );

      await transaction.query(
        `INSERT INTO intake_operations
           (organization_id, operation_key, request_fingerprint, location_id,
            valet_session_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          normalized.intakeOperationId,
          fingerprint,
          normalized.targetLocationId,
          valetSessionId,
          operationTime,
        ],
      );

      await transaction.query("COMMIT");
      return resultFromRow(session);
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the original intake-session command failure.
      }
      if (isActiveSessionConflict(error)) {
        throw new IntakeSessionCommandError(
          "ACTIVE_VALET_SESSION_CONFLICT",
        );
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}
