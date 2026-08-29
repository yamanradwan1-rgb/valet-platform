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
import {
  normalizeVehicleDetails,
  type VehicleDetailsInput,
} from "./vehicle-details-normalization";

export type VehicleDetailsCommandErrorCode =
  | "VEHICLE_DETAILS_INVALID"
  | "VEHICLE_DETAILS_SESSION_NOT_MUTABLE"
  | "VEHICLE_DETAILS_VERSION_CONFLICT";

const messages: Record<VehicleDetailsCommandErrorCode, string> = {
  VEHICLE_DETAILS_INVALID: "The vehicle details input is invalid.",
  VEHICLE_DETAILS_SESSION_NOT_MUTABLE:
    "The selected check-in session no longer permits vehicle detail changes.",
  VEHICLE_DETAILS_VERSION_CONFLICT:
    "The vehicle details were changed by another operation.",
};

export class VehicleDetailsCommandError extends Error {
  readonly code: VehicleDetailsCommandErrorCode;

  constructor(code: VehicleDetailsCommandErrorCode) {
    super(messages[code]);
    this.name = "VehicleDetailsCommandError";
    this.code = code;
  }
}

export interface VehicleDetailsCommandRequest extends VehicleDetailsInput {
  readonly authenticatedUserId: string;
  readonly expectedVehicleUpdatedAt: Date;
  readonly valetSessionId: string;
}

export interface VehicleDetailsCommandResult {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly mutationKind: "NO_CHANGE" | "UPDATED";
  readonly valetSessionId: string;
  readonly vehicleId: string;
  readonly vehicleUpdatedAt: Date;
}

interface SessionRow {
  location_id: string;
  organization_id: string;
  state: string;
  valet_session_id: string;
  vehicle_id: string;
}

interface VehicleRow {
  color: string | null;
  make: string | null;
  model: string | null;
  updated_at: Date;
  vehicle_id: string;
}

interface VehicleDetailsCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

function invalid(): never {
  throw new VehicleDetailsCommandError("VEHICLE_DETAILS_INVALID");
}

async function loadSessionScope(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<Pick<SessionRow, "location_id" | "organization_id">> {
  const result = await transaction.query<SessionRow>(
    `SELECT organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1`,
    [sessionId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return row;
}

async function lockSession(
  transaction: PostgresTransaction,
  sessionId: string,
  scope: Pick<SessionRow, "location_id" | "organization_id">,
): Promise<SessionRow> {
  const result = await transaction.query<SessionRow>(
    `SELECT id::text AS valet_session_id, organization_id::text,
            location_id::text, vehicle_id::text, state::text
     FROM valet_sessions
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR UPDATE`,
    [sessionId, scope.organization_id, scope.location_id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return row;
}

export function createVehicleDetailsCommandExecutor(
  pool: PostgresPool,
  options: VehicleDetailsCommandOptions = {},
) {
  return async (
    request: VehicleDetailsCommandRequest,
  ): Promise<VehicleDetailsCommandResult> => {
    const expected = request.expectedVehicleUpdatedAt;
    if (!(expected instanceof Date) || !Number.isFinite(expected.getTime())) {
      throw new VehicleDetailsCommandError("VEHICLE_DETAILS_VERSION_CONFLICT");
    }
    const details = normalizeVehicleDetails(
      { color: request.color, make: request.make, model: request.model },
      invalid,
      true,
    );
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      const operationTimeResult = await transaction.query<{
        operation_time: Date;
      }>(`SELECT transaction_timestamp() AS operation_time`);
      const operationTime = operationTimeResult.rows[0]?.operation_time;
      if (operationTime === undefined) {
        throw new Error("Database did not provide an operation timestamp.");
      }
      await requireActiveCustodyUser(transaction, request.authenticatedUserId);
      const scope = await loadSessionScope(transaction, request.valetSessionId);
      const actor = await authorizeCustodyActorForPersistedScope(transaction, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          locationId: scope.location_id,
          organizationId: scope.organization_id,
        },
      });
      const session = await lockSession(
        transaction,
        request.valetSessionId,
        scope,
      );
      if (session.state !== "CHECKING_IN") {
        throw new VehicleDetailsCommandError(
          "VEHICLE_DETAILS_SESSION_NOT_MUTABLE",
        );
      }
      const currentResult = await transaction.query<VehicleRow>(
        `SELECT id::text AS vehicle_id, make, model, color, updated_at
         FROM vehicles
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [session.vehicle_id, session.organization_id],
      );
      const current = currentResult.rows[0];
      if (current === undefined) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }
      if (current.updated_at.getTime() !== expected.getTime()) {
        throw new VehicleDetailsCommandError(
          "VEHICLE_DETAILS_VERSION_CONFLICT",
        );
      }
      const changed = {
        color: current.color !== details.color,
        make: current.make !== details.make,
        model: current.model !== details.model,
      };
      if (!changed.color && !changed.make && !changed.model) {
        await transaction.query("COMMIT");
        return {
          ...details,
          mutationKind: "NO_CHANGE",
          valetSessionId: session.valet_session_id,
          vehicleId: current.vehicle_id,
          vehicleUpdatedAt: current.updated_at,
        };
      }
      const updatedResult = await transaction.query<VehicleRow>(
        `UPDATE vehicles
         SET make = $4, model = $5, color = $6,
             updated_at = GREATEST($7::timestamptz,
                                   updated_at + interval '1 millisecond')
         WHERE id = $1 AND organization_id = $2 AND updated_at = $3
         RETURNING id::text AS vehicle_id, make, model, color, updated_at`,
        [
          current.vehicle_id,
          session.organization_id,
          expected,
          details.make,
          details.model,
          details.color,
          operationTime,
        ],
      );
      const updated = updatedResult.rows[0];
      if (updated === undefined) {
        throw new VehicleDetailsCommandError(
          "VEHICLE_DETAILS_VERSION_CONFLICT",
        );
      }
      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "VEHICLE_DETAILS_CORRECTED",
            metadata: {
              colorChanged: changed.color,
              makeChanged: changed.make,
              modelChanged: changed.model,
            },
          },
          entity: { id: updated.vehicle_id, type: "Vehicle" },
          occurredAt: operationTime,
          scope: {
            actorMembershipId: actor.membershipId,
            locationId: session.location_id,
            organizationId: session.organization_id,
            valetSessionId: session.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );
      await transaction.query("COMMIT");
      return {
        color: updated.color,
        make: updated.make,
        model: updated.model,
        mutationKind: "UPDATED",
        valetSessionId: session.valet_session_id,
        vehicleId: updated.vehicle_id,
        vehicleUpdatedAt: updated.updated_at,
      };
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the original Vehicle-detail failure.
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}
