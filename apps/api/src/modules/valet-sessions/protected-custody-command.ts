import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import {
  appendCustodyAuditEvent,
  type CustodyAuditEventDefinition,
} from "../audit/custody-audit-event-writer";
import {
  authorizeCustodyActorForPersistedScope,
  type AuthorizedCustodyActor,
  CustodyStaffAuthorizationError,
  type MembershipRole,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";

export type ValetSessionState =
  | "CHECKING_IN"
  | "AWAITING_PARKING"
  | "PARKING"
  | "PARKED"
  | "REQUESTED"
  | "RETRIEVING"
  | "READY"
  | "HANDOFF_PENDING"
  | "COMPLETED"
  | "CANCELLED";

export type CustodyMutationErrorCode =
  "VERSION_CONFLICT" | "INVALID_STATE_TRANSITION";

const mutationErrorMessages: Record<CustodyMutationErrorCode, string> = {
  VERSION_CONFLICT: "The custody resource was changed by another operation.",
  INVALID_STATE_TRANSITION:
    "The custody resource is not in the required state.",
};

export class CustodyMutationError extends Error {
  readonly code: CustodyMutationErrorCode;

  constructor(code: CustodyMutationErrorCode) {
    super(mutationErrorMessages[code]);
    this.name = "CustodyMutationError";
    this.code = code;
  }
}

type OperationTimestampField =
  | "checking_in_completed_at"
  | "parking_started_at"
  | "parked_at"
  | "retrieval_requested_at"
  | "retrieval_started_at"
  | "ready_at"
  | "handoff_pending_at"
  | "completed_at";

/**
 * Valet-sessions module internal definition. Future explicit commands bind
 * these values; request callers never select state, event, or timestamp effects.
 */
export interface InternalProtectedCustodyCommandDefinition {
  readonly allowedRoles: readonly MembershipRole[];
  readonly auditEvent: CustodyAuditEventDefinition;
  readonly operationTimestampField?: OperationTimestampField;
  readonly requiredState: ValetSessionState;
  readonly targetState: ValetSessionState;
}

export interface ProtectedCustodyCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedVersion: number;
  readonly valetSessionId: string;
}

export interface ProtectedCustodyCommandResult {
  readonly actor: AuthorizedCustodyActor;
  readonly auditEventId: string;
  readonly locationId: string;
  readonly operationTime: Date;
  readonly organizationId: string;
  readonly state: ValetSessionState;
  readonly valetSessionId: string;
  readonly version: number;
}

interface SessionScopeRow {
  id: string;
  location_id: string;
  organization_id: string;
  state: ValetSessionState;
  version: number;
}

type UpdatedSessionRow = SessionScopeRow;

interface InternalProtectedCustodyCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

const operationTimestampFields = new Set<OperationTimestampField>([
  "checking_in_completed_at",
  "parking_started_at",
  "parked_at",
  "retrieval_requested_at",
  "retrieval_started_at",
  "ready_at",
  "handoff_pending_at",
  "completed_at",
]);

async function loadPersistedSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<SessionScopeRow> {
  const result = await transaction.query<SessionScopeRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            state::text, version
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

async function classifyGuardedMutationFailure(
  transaction: PostgresTransaction,
  request: ProtectedCustodyCommandRequest,
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
  if (current === undefined || current.version !== request.expectedVersion) {
    throw new CustodyMutationError("VERSION_CONFLICT");
  }
  throw new CustodyMutationError("INVALID_STATE_TRANSITION");
}

/**
 * Internal command-authoring primitive for the valet-sessions module only.
 * It is intentionally not exported from a package or application barrel.
 */
export function createInternalProtectedCustodyCommandExecutor(
  pool: PostgresPool,
  definition: InternalProtectedCustodyCommandDefinition,
  options: InternalProtectedCustodyCommandOptions = {},
): (
  request: ProtectedCustodyCommandRequest,
) => Promise<ProtectedCustodyCommandResult> {
  const auditEventIdFactory = options.auditEventIdFactory;

  return async (
    request: ProtectedCustodyCommandRequest,
  ): Promise<ProtectedCustodyCommandResult> => {
    if (
      !Number.isInteger(request.expectedVersion) ||
      request.expectedVersion < 1
    ) {
      throw new CustodyMutationError("VERSION_CONFLICT");
    }
    if (
      definition.operationTimestampField !== undefined &&
      !operationTimestampFields.has(definition.operationTimestampField)
    ) {
      throw new Error(
        "Protected custody command has an unsafe timestamp field.",
      );
    }

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
      const session = await loadPersistedSessionScope(
        transaction,
        request.valetSessionId,
      );
      const actor = await authorizeCustodyActorForPersistedScope(transaction, {
        allowedRoles: definition.allowedRoles,
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          locationId: session.location_id,
          organizationId: session.organization_id,
        },
      });

      if (session.version !== request.expectedVersion) {
        throw new CustodyMutationError("VERSION_CONFLICT");
      }
      if (session.state !== definition.requiredState) {
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      }

      const timestampAssignment =
        definition.operationTimestampField === undefined
          ? ""
          : `, "${definition.operationTimestampField}" = $5`;
      const mutationResult = await transaction.query<UpdatedSessionRow>(
        `UPDATE valet_sessions
         SET state = $4,
             version = version + 1,
             updated_at = $5
             ${timestampAssignment}
         WHERE id = $1
           AND version = $2
           AND state = $3
         RETURNING id::text, organization_id::text, location_id::text,
                   state::text, version`,
        [
          request.valetSessionId,
          request.expectedVersion,
          definition.requiredState,
          definition.targetState,
          operationTime,
        ],
      );
      const updatedSession = mutationResult.rows[0];
      if (updatedSession === undefined) {
        await classifyGuardedMutationFailure(transaction, request);
        throw new Error("Guarded mutation failure was not classified.");
      }

      const auditEventId = await appendCustodyAuditEvent(
        transaction,
        {
          definition: definition.auditEvent,
          occurredAt: operationTime,
          scope: {
            actorMembershipId: actor.membershipId,
            locationId: updatedSession.location_id,
            organizationId: updatedSession.organization_id,
            valetSessionId: updatedSession.id,
          },
        },
        auditEventIdFactory,
      );

      await transaction.query("COMMIT");
      return {
        actor,
        auditEventId,
        locationId: updatedSession.location_id,
        operationTime,
        organizationId: updatedSession.organization_id,
        state: updatedSession.state,
        valetSessionId: updatedSession.id,
        version: updatedSession.version,
      };
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the original protected-command failure.
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}
