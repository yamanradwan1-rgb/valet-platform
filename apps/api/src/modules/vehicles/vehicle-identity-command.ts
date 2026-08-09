import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import {
  authorizeCustodyActorForPersistedScope,
  type AuthorizedCustodyActor,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";

export const vehicleIdentityLimits = {
  plateRawCodePoints: 64,
  temporaryDescriptorCodePoints: 160,
} as const;

export type VehicleIdentityCommandErrorCode =
  | "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED"
  | "VEHICLE_IDENTITY_CONFLICT"
  | "VEHICLE_IDENTITY_INVALID"
  | "VEHICLE_IDENTITY_VERSION_CONFLICT";

const errorMessages: Record<VehicleIdentityCommandErrorCode, string> = {
  VEHICLE_IDENTITY_CONFIRMATION_REQUIRED:
    "A human must explicitly confirm the plate identity.",
  VEHICLE_IDENTITY_CONFLICT:
    "The confirmed vehicle identity conflicts with an existing vehicle.",
  VEHICLE_IDENTITY_INVALID: "The vehicle identity input is invalid.",
  VEHICLE_IDENTITY_VERSION_CONFLICT:
    "The vehicle identity was changed by another operation.",
};

export class VehicleIdentityCommandError extends Error {
  readonly code: VehicleIdentityCommandErrorCode;

  constructor(code: VehicleIdentityCommandErrorCode) {
    super(errorMessages[code]);
    this.name = "VehicleIdentityCommandError";
    this.code = code;
  }
}

export interface PlateCandidateMetadata {
  readonly plateCountry?: string;
  readonly plateNumberRaw: string;
  readonly source: "ANPR" | "OCR";
}

export interface ConfirmedPlateIdentityInput {
  readonly confirmedByHuman: boolean;
  readonly mode: "CONFIRMED_PLATE";
  readonly plateCandidate?: PlateCandidateMetadata;
  readonly plateCountry: string;
  readonly plateNumberRaw: string;
}

export interface TemporaryVehicleIdentityInput {
  readonly mode: "TEMPORARY_DESCRIPTOR";
  readonly temporaryDescriptor: string;
}

export type VehicleIdentityInput =
  ConfirmedPlateIdentityInput | TemporaryVehicleIdentityInput;

export interface VehicleIdentityCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedVehicleUpdatedAt: Date;
  readonly identity: VehicleIdentityInput;
  readonly valetSessionId: string;
}

export interface VehicleIdentityCommandResult {
  readonly actor: AuthorizedCustodyActor;
  readonly auditEventId: string;
  readonly identityMode: VehicleIdentityInput["mode"];
  readonly locationId: string;
  readonly operationTime: Date;
  readonly organizationId: string;
  readonly plateCountry: string | null;
  readonly plateNumberNormalized: string | null;
  readonly plateNumberRaw: string | null;
  readonly temporaryDescriptor: string | null;
  readonly valetSessionId: string;
  readonly vehicleId: string;
  readonly vehicleUpdatedAt: Date;
}

interface VehicleScopeRow {
  location_id: string;
  organization_id: string;
  plate_country: string | null;
  plate_number_normalized: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
  updated_at: Date;
  valet_session_id: string;
  vehicle_id: string;
}

interface NormalizedConfirmedIdentity {
  mode: "CONFIRMED_PLATE";
  plateCountry: string;
  plateNumberNormalized: string;
  plateNumberRaw: string;
}

interface NormalizedTemporaryIdentity {
  mode: "TEMPORARY_DESCRIPTOR";
  temporaryDescriptor: string;
}

type NormalizedVehicleIdentity =
  NormalizedConfirmedIdentity | NormalizedTemporaryIdentity;

interface VehicleIdentityCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

const obviousPlateSeparatorPattern = /[\s\p{Pd}._/\\]+/gu;
const plateCountryPattern = /^[A-Z]{2}$/;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function assertOnlyKeys(value: object, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
}

function trimBoundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  const trimmed = value.trim();
  if (trimmed === "" || codePointLength(trimmed) > maximum) {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  return trimmed;
}

function normalizePlateCountry(value: unknown): string {
  if (typeof value !== "string") {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  const normalized = value.trim().normalize("NFKC").toUpperCase();
  if (!plateCountryPattern.test(normalized)) {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  return normalized;
}

export function normalizePlateNumber(plateNumberRaw: string): {
  plateNumberNormalized: string;
  plateNumberRaw: string;
} {
  const raw = trimBoundedText(
    plateNumberRaw,
    vehicleIdentityLimits.plateRawCodePoints,
  );
  const normalized = raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(obviousPlateSeparatorPattern, "");
  if (normalized === "") {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  return { plateNumberNormalized: normalized, plateNumberRaw: raw };
}

function normalizeIdentity(
  input: VehicleIdentityInput,
): NormalizedVehicleIdentity {
  if (input === null || typeof input !== "object") {
    throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
  }
  if (input.mode === "CONFIRMED_PLATE") {
    assertOnlyKeys(input, [
      "confirmedByHuman",
      "mode",
      "plateCandidate",
      "plateCountry",
      "plateNumberRaw",
    ]);
    if (input.plateCandidate !== undefined) {
      const candidate = input.plateCandidate;
      if (candidate === null || typeof candidate !== "object") {
        throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
      }
      assertOnlyKeys(candidate, ["plateCountry", "plateNumberRaw", "source"]);
      if (candidate.source !== "ANPR" && candidate.source !== "OCR") {
        throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
      }
      trimBoundedText(
        candidate.plateNumberRaw,
        vehicleIdentityLimits.plateRawCodePoints,
      );
      if (candidate.plateCountry !== undefined) {
        normalizePlateCountry(candidate.plateCountry);
      }
    }
    if (input.confirmedByHuman !== true) {
      throw new VehicleIdentityCommandError(
        "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED",
      );
    }
    const plate = normalizePlateNumber(input.plateNumberRaw);
    return {
      mode: input.mode,
      plateCountry: normalizePlateCountry(input.plateCountry),
      ...plate,
    };
  }
  if (input.mode === "TEMPORARY_DESCRIPTOR") {
    assertOnlyKeys(input, ["mode", "temporaryDescriptor"]);
    return {
      mode: input.mode,
      temporaryDescriptor: trimBoundedText(
        input.temporaryDescriptor,
        vehicleIdentityLimits.temporaryDescriptorCodePoints,
      ),
    };
  }
  throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_INVALID");
}

async function loadVehicleScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<VehicleScopeRow> {
  const result = await transaction.query<VehicleScopeRow>(
    `SELECT session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            vehicle.id::text AS vehicle_id, vehicle.plate_country,
            vehicle.plate_number_raw, vehicle.plate_number_normalized,
            vehicle.temporary_descriptor, vehicle.updated_at
     FROM valet_sessions AS session
     INNER JOIN vehicles AS vehicle
       ON vehicle.organization_id = session.organization_id
      AND vehicle.id = session.vehicle_id
     WHERE session.id = $1`,
    [valetSessionId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

function isKnownPlateConflict(error: unknown): boolean {
  const databaseError = error as Partial<DatabaseError>;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "vehicles_known_plate_unique_idx"
  );
}

function mutationKind(
  current: VehicleScopeRow,
  identity: NormalizedVehicleIdentity,
): "CORRECTED" | "SET" {
  if (identity.mode === "CONFIRMED_PLATE") {
    return current.plate_number_normalized === null ? "SET" : "CORRECTED";
  }
  return current.temporary_descriptor === null ? "SET" : "CORRECTED";
}

export function createVehicleIdentityCommandExecutor(
  pool: PostgresPool,
  options: VehicleIdentityCommandOptions = {},
): (
  request: VehicleIdentityCommandRequest,
) => Promise<VehicleIdentityCommandResult> {
  return async (request) => {
    const expectedUpdatedAt = request.expectedVehicleUpdatedAt;
    if (
      !(expectedUpdatedAt instanceof Date) ||
      !Number.isFinite(expectedUpdatedAt.getTime())
    ) {
      throw new VehicleIdentityCommandError(
        "VEHICLE_IDENTITY_VERSION_CONFLICT",
      );
    }
    const identity = normalizeIdentity(request.identity);
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

      await requireActiveCustodyUser(transaction, request.authenticatedUserId);
      const scope = await loadVehicleScope(transaction, request.valetSessionId);
      const actor = await authorizeCustodyActorForPersistedScope(transaction, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          locationId: scope.location_id,
          organizationId: scope.organization_id,
        },
      });
      const kind = mutationKind(scope, identity);

      const values =
        identity.mode === "CONFIRMED_PLATE"
          ? [
              identity.plateCountry,
              identity.plateNumberRaw,
              identity.plateNumberNormalized,
              scope.temporary_descriptor,
            ]
          : [null, null, null, identity.temporaryDescriptor];
      const mutationResult = await transaction.query<VehicleScopeRow>(
        `UPDATE vehicles
         SET plate_country = $4,
             plate_number_raw = $5,
             plate_number_normalized = $6,
             temporary_descriptor = $7,
             updated_at = GREATEST($8::timestamptz,
                                   updated_at + interval '1 millisecond')
         WHERE id = $1
           AND organization_id = $2
           AND updated_at = $3
         RETURNING id::text AS vehicle_id, organization_id::text,
                   $9::uuid::text AS valet_session_id,
                   $10::uuid::text AS location_id, plate_country,
                   plate_number_raw, plate_number_normalized,
                   temporary_descriptor, updated_at`,
        [
          scope.vehicle_id,
          scope.organization_id,
          expectedUpdatedAt,
          ...values,
          operationTime,
          scope.valet_session_id,
          scope.location_id,
        ],
      );
      const updated = mutationResult.rows[0];
      if (updated === undefined) {
        throw new VehicleIdentityCommandError(
          "VEHICLE_IDENTITY_VERSION_CONFLICT",
        );
      }

      const auditEventId = await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: `VEHICLE_${identity.mode}_IDENTITY_${kind}`,
            metadata: {
              identityMode: identity.mode,
              mutationKind: kind,
              normalizationVersion: "V1",
            },
          },
          entity: { id: updated.vehicle_id, type: "Vehicle" },
          occurredAt: operationTime,
          scope: {
            actorMembershipId: actor.membershipId,
            locationId: scope.location_id,
            organizationId: scope.organization_id,
            valetSessionId: scope.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );

      await transaction.query("COMMIT");
      return {
        actor,
        auditEventId,
        identityMode: identity.mode,
        locationId: scope.location_id,
        operationTime,
        organizationId: scope.organization_id,
        plateCountry: updated.plate_country,
        plateNumberNormalized: updated.plate_number_normalized,
        plateNumberRaw: updated.plate_number_raw,
        temporaryDescriptor: updated.temporary_descriptor,
        valetSessionId: scope.valet_session_id,
        vehicleId: updated.vehicle_id,
        vehicleUpdatedAt: updated.updated_at,
      };
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the original vehicle-identity command failure.
      }
      if (isKnownPlateConflict(error)) {
        throw new VehicleIdentityCommandError("VEHICLE_IDENTITY_CONFLICT");
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}
