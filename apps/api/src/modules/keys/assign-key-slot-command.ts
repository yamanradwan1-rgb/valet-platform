import type { DatabaseError } from "pg";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendKeyAuditEvent } from "./key-audit-event-writer";
import {
  assertKeyCommandGuards,
  mutateCurrentKeySlot,
  validateExpectedVersion,
} from "./key-command-guards";
import { appendKeyCustodyEvent } from "./key-custody-event-writer";
import { KeySlotOperationError } from "./key-errors";
import { lockAuthorizedKeySession } from "./key-session-authorization";
import { inKeyTransaction, loadKeyOperationTime } from "./key-transaction";
import type { AuthorizedKeySession, KeyAssignmentResult } from "./key-types";

export interface AssignKeySlotCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedVersion: number;
  readonly keySlotCode: string;
  readonly sessionId: string;
}

interface AssignKeySlotCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
}

interface KeySlotRow {
  readonly code: string;
  readonly id: string;
}

const occupancyConstraint = "valet_sessions_key_slot_id_key";

async function lockRequestedSlot(
  transaction: PostgresTransaction,
  session: AuthorizedKeySession,
  code: string,
): Promise<KeySlotRow> {
  const result = await transaction.query<KeySlotRow>(
    `SELECT id::text, code
     FROM key_slots
     WHERE organization_id = $1
       AND location_id = $2
       AND code = $3
       AND status = 'ACTIVE'
     FOR UPDATE`,
    [session.organization_id, session.location_id, code],
  );
  const slot = result.rows[0];
  if (slot === undefined) throw new KeySlotOperationError();

  const occupant = await transaction.query<{ id: string }>(
    `SELECT id::text
     FROM valet_sessions
     WHERE key_slot_id = $1 AND id <> $2`,
    [slot.id, session.session_id],
  );
  if (occupant.rows[0] !== undefined) throw new KeySlotOperationError();
  return slot;
}

function projection(
  session: AuthorizedKeySession,
  keySlotCode: string,
  version = session.version,
): KeyAssignmentResult {
  return {
    keySlotCode,
    sessionId: session.session_id,
    state: "AWAITING_PARKING",
    version,
  };
}

async function executeAssignment(
  transaction: PostgresTransaction,
  request: AssignKeySlotCommandRequest,
  options: AssignKeySlotCommandOptions,
): Promise<KeyAssignmentResult> {
  const session = await lockAuthorizedKeySession(transaction, request);
  assertKeyCommandGuards(session, request.expectedVersion);
  const slot = await lockRequestedSlot(
    transaction,
    session,
    request.keySlotCode.trim(),
  );
  if (session.key_slot_id === slot.id) return projection(session, slot.code);

  const operationTime = await loadKeyOperationTime(transaction);
  const nextVersion = await mutateCurrentKeySlot(transaction, {
    expectedVersion: request.expectedVersion,
    keySlotId: slot.id,
    operationTime,
    sessionId: session.session_id,
  });
  const custodyScope = {
    actorMembershipId: session.actorMembershipId,
    locationId: session.location_id,
    occurredAt: operationTime,
    organizationId: session.organization_id,
    sessionId: session.session_id,
  };
  if (session.key_slot_id !== null) {
    await appendKeyCustodyEvent(
      transaction,
      {
        ...custodyScope,
        eventType: "SLOT_CLEARED",
        keySlotId: session.key_slot_id,
      },
      options.custodyEventIdFactory,
    );
  }
  await appendKeyCustodyEvent(
    transaction,
    { ...custodyScope, eventType: "SLOT_ASSIGNED", keySlotId: slot.id },
    options.custodyEventIdFactory,
  );
  await appendKeyAuditEvent(
    transaction,
    {
      ...custodyScope,
      currentKeySlotId: slot.id,
      eventType:
        session.key_slot_id === null
          ? "VALET_SESSION_KEY_SLOT_ASSIGNED"
          : "VALET_SESSION_KEY_SLOT_REASSIGNED",
      fromVersion: session.version,
      previousKeySlotId: session.key_slot_id,
      toVersion: nextVersion,
    },
    options.auditEventIdFactory,
  );
  return projection(session, slot.code, nextVersion);
}

function isOccupancyConflict(error: unknown): boolean {
  const databaseError = error as DatabaseError;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === occupancyConstraint
  );
}

export function createAssignKeySlotCommandExecutor(
  pool: PostgresPool,
  options: AssignKeySlotCommandOptions = {},
): (request: AssignKeySlotCommandRequest) => Promise<KeyAssignmentResult> {
  return async (request) => {
    validateExpectedVersion(request.expectedVersion);
    try {
      return await inKeyTransaction(pool, (transaction) =>
        executeAssignment(transaction, request, options),
      );
    } catch (error) {
      if (isOccupancyConflict(error)) throw new KeySlotOperationError();
      throw error;
    }
  };
}
