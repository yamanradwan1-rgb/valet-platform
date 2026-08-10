import { randomUUID } from "node:crypto";

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
import { evaluateLockedCheckInConditionGuard } from "./check-in-condition-command";
import {
  CustodyMutationError,
  type ValetSessionState,
} from "./protected-custody-command";

export type CompleteCheckInCommandErrorCode =
  | "CONDITION_CHECK_INCOMPLETE"
  | "PHOTO_REQUIREMENT_NOT_SATISFIED"
  | "VEHICLE_IDENTITY_INCOMPLETE";

const errorMessages: Record<CompleteCheckInCommandErrorCode, string> = {
  CONDITION_CHECK_INCOMPLETE:
    "The check-in condition review has not been completed.",
  PHOTO_REQUIREMENT_NOT_SATISFIED:
    "The current check-in photo requirement is not satisfied.",
  VEHICLE_IDENTITY_INCOMPLETE:
    "The session vehicle does not have an accepted identity.",
};

export class CompleteCheckInCommandError extends Error {
  readonly code: CompleteCheckInCommandErrorCode;

  constructor(code: CompleteCheckInCommandErrorCode) {
    super(errorMessages[code]);
    this.name = "CompleteCheckInCommandError";
    this.code = code;
  }
}

export interface CompleteCheckInCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedVersion: number;
  readonly valetSessionId: string;
}

export interface CompleteCheckInCommandResult {
  readonly actorMembershipId: string;
  readonly auditEventId: string;
  readonly checkingInCompletedAt: Date;
  readonly locationId: string;
  readonly operationTime: Date;
  readonly organizationId: string;
  readonly state: "AWAITING_PARKING";
  readonly valetSessionId: string;
  readonly version: number;
}

interface CompleteCheckInCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

interface SessionScopeRow {
  id: string;
  location_id: string;
  organization_id: string;
}

interface LockedSessionRow extends SessionScopeRow {
  state: ValetSessionState;
  vehicle_id: string;
  version: number;
}

interface VehicleIdentityRow {
  plate_country: string | null;
  plate_number_normalized: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}

interface UpdatedSessionRow extends SessionScopeRow {
  checking_in_completed_at: Date;
  state: "AWAITING_PARKING";
  updated_at: Date;
  version: number;
}

const plateCountryPattern = /^[A-Z]{2}$/;

async function inTransaction<T>(
  pool: PostgresPool,
  operation: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  const transaction = await pool.connect();
  try {
    await transaction.query("BEGIN");
    const result = await operation(transaction);
    await transaction.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await transaction.query("ROLLBACK");
    } catch {
      // Preserve the original complete-check-in failure.
    }
    throw error;
  } finally {
    transaction.release();
  }
}

async function loadSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<SessionScopeRow> {
  const result = await transaction.query<SessionScopeRow>(
    `SELECT id::text, organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1`,
    [valetSessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return session;
}

async function lockSessionScope(
  transaction: PostgresTransaction,
  session: SessionScopeRow,
): Promise<LockedSessionRow> {
  const result = await transaction.query<LockedSessionRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            vehicle_id::text, state::text, version
     FROM valet_sessions
     WHERE id = $1
       AND organization_id = $2
       AND location_id = $3
     FOR UPDATE`,
    [session.id, session.organization_id, session.location_id],
  );
  const locked = result.rows[0];
  if (locked === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return locked;
}

function requireVersionAndState(
  session: Pick<LockedSessionRow, "state" | "version">,
  expectedVersion: number,
): void {
  if (session.version !== expectedVersion) {
    throw new CustodyMutationError("VERSION_CONFLICT");
  }
  if (session.state !== "CHECKING_IN") {
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  }
}

async function loadLockedVehicleIdentity(
  transaction: PostgresTransaction,
  session: LockedSessionRow,
): Promise<VehicleIdentityRow> {
  const result = await transaction.query<VehicleIdentityRow>(
    `SELECT plate_country, plate_number_raw, plate_number_normalized,
            temporary_descriptor
     FROM vehicles
     WHERE id = $1 AND organization_id = $2
     FOR SHARE`,
    [session.vehicle_id, session.organization_id],
  );
  const vehicle = result.rows[0];
  if (vehicle === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return vehicle;
}

export function hasAcceptedPersistedVehicleIdentity(
  identity: VehicleIdentityRow,
): boolean {
  const plateFields = [
    identity.plate_country,
    identity.plate_number_raw,
    identity.plate_number_normalized,
  ];
  const allPlateFieldsPresent = plateFields.every((value) => value !== null);
  const allPlateFieldsAbsent = plateFields.every((value) => value === null);

  if (allPlateFieldsPresent) {
    return (
      plateCountryPattern.test(identity.plate_country ?? "") &&
      (identity.plate_number_raw?.trim() ?? "") !== "" &&
      (identity.plate_number_normalized?.trim() ?? "") !== ""
    );
  }

  return (
    allPlateFieldsAbsent &&
    (identity.temporary_descriptor?.trim() ?? "") !== ""
  );
}

async function classifyGuardedMutationFailure(
  transaction: PostgresTransaction,
  request: CompleteCheckInCommandRequest,
): Promise<never> {
  const result = await transaction.query<{
    state: ValetSessionState;
    version: number;
  }>(
    `SELECT state::text, version
     FROM valet_sessions
     WHERE id = $1`,
    [request.valetSessionId],
  );
  const current = result.rows[0];
  if (current === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  requireVersionAndState(current, request.expectedVersion);
  throw new Error("Guarded complete-check-in failure was not classified.");
}

export function createCompleteCheckInCommandExecutor(
  pool: PostgresPool,
  options: CompleteCheckInCommandOptions = {},
): (
  request: CompleteCheckInCommandRequest,
) => Promise<CompleteCheckInCommandResult> {
  return async (request) => {
    if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
      throw new CustodyMutationError("VERSION_CONFLICT");
    }

    return inTransaction(pool, async (transaction) => {
      await requireActiveCustodyUser(transaction, request.authenticatedUserId);
      const initialScope = await loadSessionScope(
        transaction,
        request.valetSessionId,
      );
      const actor = await authorizeCustodyActorForPersistedScope(transaction, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          locationId: initialScope.location_id,
          organizationId: initialScope.organization_id,
        },
      });
      const session = await lockSessionScope(transaction, initialScope);

      requireVersionAndState(session, request.expectedVersion);

      const vehicle = await loadLockedVehicleIdentity(transaction, session);
      if (!hasAcceptedPersistedVehicleIdentity(vehicle)) {
        throw new CompleteCheckInCommandError("VEHICLE_IDENTITY_INCOMPLETE");
      }

      const conditionGuard = await evaluateLockedCheckInConditionGuard(
        transaction,
        {
          locationId: session.location_id,
          organizationId: session.organization_id,
          valetSessionId: session.id,
        },
      );
      if (!conditionGuard.markerComplete) {
        throw new CompleteCheckInCommandError("CONDITION_CHECK_INCOMPLETE");
      }
      if (
        conditionGuard.photoPolicy.required &&
        !conditionGuard.qualifyingPhotoPresent
      ) {
        throw new CompleteCheckInCommandError(
          "PHOTO_REQUIREMENT_NOT_SATISFIED",
        );
      }

      const timeResult = await transaction.query<{ operation_time: Date }>(
        `SELECT clock_timestamp() AS operation_time`,
      );
      const operationTime = timeResult.rows[0]?.operation_time;
      if (operationTime === undefined) {
        throw new Error("Database did not provide an operation timestamp.");
      }

      const mutationResult = await transaction.query<UpdatedSessionRow>(
        `UPDATE valet_sessions
         SET state = 'AWAITING_PARKING',
             checking_in_completed_at = $4,
             version = version + 1,
             updated_at = $4
         WHERE id = $1
           AND version = $2
           AND state = $3
         RETURNING id::text, organization_id::text, location_id::text,
                   state::text, version, checking_in_completed_at, updated_at`,
        [
          session.id,
          request.expectedVersion,
          "CHECKING_IN",
          operationTime,
        ],
      );
      const updated = mutationResult.rows[0];
      if (updated === undefined) {
        return await classifyGuardedMutationFailure(transaction, request);
      }

      const auditEventId = await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "VALET_SESSION_CHECK_IN_COMPLETED",
            metadata: {
              fromState: "CHECKING_IN",
              fromVersion: request.expectedVersion,
              toState: "AWAITING_PARKING",
              toVersion: request.expectedVersion + 1,
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId: actor.membershipId,
            locationId: updated.location_id,
            organizationId: updated.organization_id,
            valetSessionId: updated.id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );

      return {
        actorMembershipId: actor.membershipId,
        auditEventId,
        checkingInCompletedAt: updated.checking_in_completed_at,
        locationId: updated.location_id,
        operationTime,
        organizationId: updated.organization_id,
        state: updated.state,
        valetSessionId: updated.id,
        version: updated.version,
      };
    });
  };
}
