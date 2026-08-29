import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import type { AuthorizedCheckInLocation } from "../check-in-api/check-in-location-authorization";
import type { NormalizedIntakeRequest } from "./intake-session-normalization";
import type {
  IntakeSessionCommandOptions,
  IntakeSessionCommandResult,
} from "./intake-session-types";
import type { IntakeVehicleRow } from "./intake-vehicle-resolution";

export interface IntakeResultRow {
  color: string | null;
  created_at: Date;
  customer_id: string | null;
  location_id: string;
  make: string | null;
  model: string | null;
  organization_id: string;
  request_fingerprint: string;
  valet_session_id: string;
  vehicle_id: string;
  vehicle_updated_at: Date;
}

export async function loadExistingIntakeOperation(
  transaction: PostgresTransaction,
  organizationId: string,
  operationKey: string,
): Promise<IntakeResultRow | undefined> {
  const result = await transaction.query<IntakeResultRow>(
    `SELECT operation.request_fingerprint,
            session.id::text AS valet_session_id,
            session.organization_id::text, session.location_id::text,
            session.vehicle_id::text, session.customer_id::text,
            session.created_at, vehicle.make, vehicle.model, vehicle.color,
            vehicle.updated_at AS vehicle_updated_at
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

export function intakeResultFromRow(
  row: IntakeResultRow,
): IntakeSessionCommandResult {
  return {
    color: row.color,
    createdAt: row.created_at,
    customerId: row.customer_id,
    locationId: row.location_id,
    make: row.make,
    model: row.model,
    organizationId: row.organization_id,
    state: "CHECKING_IN",
    valetSessionId: row.valet_session_id,
    vehicleId: row.vehicle_id,
    vehicleUpdatedAt: row.vehicle_updated_at,
    version: 1,
  };
}

export async function insertIntakeSession(
  transaction: PostgresTransaction,
  input: {
    customerId: string | null;
    fingerprint: string;
    normalized: NormalizedIntakeRequest;
    operationTime: Date;
    options: IntakeSessionCommandOptions;
    scope: AuthorizedCheckInLocation;
    vehicle: IntakeVehicleRow;
  },
): Promise<IntakeResultRow> {
  const valetSessionId = (input.options.sessionIdFactory ?? randomUUID)();
  const entropy = (
    input.options.disabledGuestEntropyFactory ?? (() => randomBytes(32))
  )();
  const guestHash = `disabled:intake:${createHash("sha256")
    .update(entropy)
    .digest("hex")}`;
  const session = await transaction.query<IntakeResultRow>(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        customer_access_revoked_at, organization_id, location_id,
        vehicle_id, customer_id, state, checked_in_by_membership_id,
        created_at, version, updated_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'CHECKING_IN', $8,
             $3, 1, $3)
     RETURNING id::text AS valet_session_id, organization_id::text,
               location_id::text, vehicle_id::text, customer_id::text,
               created_at, $9::text AS request_fingerprint,
               $10::text AS make, $11::text AS model, $12::text AS color,
               $13::timestamptz AS vehicle_updated_at`,
    [
      valetSessionId,
      guestHash,
      input.operationTime,
      input.scope.organizationId,
      input.normalized.targetLocationId,
      input.vehicle.id,
      input.customerId,
      input.scope.actor.membershipId,
      input.fingerprint,
      input.vehicle.make,
      input.vehicle.model,
      input.vehicle.color,
      input.vehicle.updated_at,
    ],
  );
  const row = session.rows[0];
  if (row === undefined) throw new Error("Intake creation returned no row.");

  await appendCustodyAuditEvent(
    transaction,
    {
      definition: {
        eventType: "VALET_SESSION_CREATED",
        metadata: {
          customerPresent: input.customerId !== null,
          identityMode: input.normalized.vehicleIdentity.mode,
          intakeContractVersion: "V2",
        },
      },
      occurredAt: input.operationTime,
      scope: {
        actorMembershipId: input.scope.actor.membershipId,
        locationId: input.normalized.targetLocationId,
        organizationId: input.scope.organizationId,
        valetSessionId,
      },
    },
    input.options.auditEventIdFactory ?? randomUUID,
  );
  await transaction.query(
    `INSERT INTO intake_operations
       (organization_id, operation_key, request_fingerprint, location_id,
        valet_session_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.scope.organizationId,
      input.normalized.intakeOperationId,
      input.fingerprint,
      input.normalized.targetLocationId,
      valetSessionId,
      input.operationTime,
    ],
  );
  return row;
}
