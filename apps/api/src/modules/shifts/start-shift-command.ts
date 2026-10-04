import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";
import type { ShiftPresenceEvidence } from "@valet/contracts";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  guardPresenceShiftIntent,
  presenceDatabaseError,
  recheckPresenceShiftSession,
} from "./shift-presence-security";
import { denyRevokedPresenceStart } from "./shift-presence-revoked-start";
import {
  preparePresenceShiftAttempt,
  recoverPresenceShiftAttempt,
  type PresenceDeniedResult,
} from "./shift-presence-command";
import { ShiftPresenceError } from "./shift-presence-errors";
import { convergePresenceShiftAttempt } from "./shift-presence-convergence";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendShiftAuditEvent } from "./shift-audit-event-writer";
import {
  authorizeShiftStart,
  type AuthorizedShiftStartScope,
} from "./shift-authorization";
import { ShiftOperationError } from "./shift-errors";
import {
  inShiftTransaction,
  loadShiftOperationTime,
} from "./shift-transaction";
import {
  type PersistedShiftRow,
  type ShiftResult,
  toShiftResult,
} from "./shift-types";

export interface StartShiftCommandRequest {
  readonly authenticatedUserId: string;
  readonly targetLocationId: string;
  readonly operationId?: string;
  readonly presence?: ShiftPresenceEvidence;
  readonly sessionContext?: StaffSessionContext;
}

interface StartShiftCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly shiftIdFactory?: () => string;
  readonly presenceFingerprintKey?: Uint8Array;
}

const activeShiftConstraint = "shifts_one_active_per_membership_idx";

function startPresenceAttempt(
  scope: AuthorizedShiftStartScope,
  request: StartShiftCommandRequest,
) {
  return {
    ...scope,
    userId: request.authenticatedUserId,
    action: "START" as const,
    shiftId: null,
    cashReported: null,
    ...(request.operationId === undefined
      ? {}
      : { operationId: request.operationId }),
    ...(request.presence === undefined ? {} : { evidence: request.presence }),
  };
}

async function loadActiveMembershipShift(
  transaction: PostgresTransaction,
  membershipId: string,
): Promise<PersistedShiftRow | undefined> {
  const result = await transaction.query<PersistedShiftRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            membership_id::text, status::text, started_at, ended_at,
            cash_expected::text, cash_reported::text, cash_variance::text,
            cash_currency, cash_reported_at
     FROM shifts
     WHERE membership_id = $1 AND status = 'ACTIVE'
     FOR UPDATE`,
    [membershipId],
  );
  return result.rows[0];
}

function classifyActiveShift(
  activeShift: PersistedShiftRow,
  targetLocationId: string,
): ShiftResult {
  if (activeShift.location_id !== targetLocationId) {
    throw new ShiftOperationError("ACTIVE_SHIFT_CONFLICT");
  }
  return toShiftResult(activeShift);
}

async function createShift(
  transaction: PostgresTransaction,
  scope: AuthorizedShiftStartScope,
  options: StartShiftCommandOptions,
  presenceCommit: (shiftId: string) => Promise<void>,
): Promise<ShiftResult> {
  const operationTime = await loadShiftOperationTime(transaction);
  const shiftId = (options.shiftIdFactory ?? randomUUID)();
  const result = await transaction.query<PersistedShiftRow>(
    `INSERT INTO shifts
       (id, organization_id, location_id, membership_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
     RETURNING id::text, organization_id::text, location_id::text,
               membership_id::text, status::text, started_at, ended_at,
               cash_expected::text, cash_reported::text, cash_variance::text,
               cash_currency, cash_reported_at`,
    [
      shiftId,
      scope.organizationId,
      scope.locationId,
      scope.membershipId,
      operationTime,
    ],
  );
  const shift = result.rows[0];
  if (shift === undefined) {
    throw new Error("Shift creation did not return the persisted Shift.");
  }
  await presenceCommit(shiftId);
  await appendShiftAuditEvent(
    transaction,
    {
      eventType: "SHIFT_STARTED",
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      occurredAt: operationTime,
      organizationId: scope.organizationId,
      shiftId,
    },
    options.auditEventIdFactory,
  );
  return toShiftResult(shift);
}

async function attemptStart(
  pool: PostgresPool,
  request: StartShiftCommandRequest,
  options: StartShiftCommandOptions,
): Promise<ShiftResult | PresenceDeniedResult> {
  return inShiftTransaction(pool, async (transaction) => {
    const result = await startInTransaction(transaction, request, options);
    await recheckPresenceShiftSession(transaction, request.sessionContext);
    return result;
  });
}

async function startInTransaction(
  transaction: PostgresTransaction,
  request: StartShiftCommandRequest,
  options: StartShiftCommandOptions,
) {
  await guardPresenceShiftIntent(transaction, request);
  let scope: AuthorizedShiftStartScope;
  try {
    scope = await authorizeShiftStart(transaction, request);
  } catch (error) {
    if (!(error instanceof ShiftOperationError)) throw error;
    const denied = await denyRevokedPresenceStart(
      transaction,
      request,
      options.presenceFingerprintKey,
    );
    if (denied !== undefined) return denied;
    throw error;
  }
  const attempt = startPresenceAttempt(scope, request);
  const recovery = await recoverPresenceShiftAttempt(
    transaction,
    attempt,
    options.presenceFingerprintKey,
  );
  if (recovery !== undefined) return recovery;
  const activeShift = await loadActiveMembershipShift(
    transaction,
    scope.membershipId,
  );
  if (activeShift !== undefined) {
    const result = classifyActiveShift(activeShift, scope.locationId);
    await convergePresenceShiftAttempt(
      transaction,
      attempt,
      activeShift,
      options.presenceFingerprintKey,
    );
    return result;
  }
  const presence = await preparePresenceShiftAttempt(
    transaction,
    attempt,
    options.presenceFingerprintKey,
  );
  if ("denied" in presence) return { denied: presence.denied! };
  return createShift(transaction, scope, options, presence.commit);
}

async function recoverConcurrentStart(
  pool: PostgresPool,
  request: StartShiftCommandRequest,
  options: StartShiftCommandOptions,
): Promise<ShiftResult | PresenceDeniedResult> {
  return inShiftTransaction(pool, async (transaction) => {
    await guardPresenceShiftIntent(transaction, request);
    const scope = await authorizeShiftStart(transaction, request);
    const attempt = startPresenceAttempt(scope, request);
    const exact = await recoverPresenceShiftAttempt(
      transaction,
      attempt,
      options.presenceFingerprintKey,
    );
    if (exact !== undefined) {
      await recheckPresenceShiftSession(transaction, request.sessionContext);
      return exact;
    }
    const activeShift = await loadActiveMembershipShift(
      transaction,
      scope.membershipId,
    );
    if (activeShift === undefined) {
      throw new Error("Concurrent Shift start could not be recovered.");
    }
    const result = classifyActiveShift(activeShift, scope.locationId);
    await convergePresenceShiftAttempt(
      transaction,
      attempt,
      activeShift,
      options.presenceFingerprintKey,
    );
    await recheckPresenceShiftSession(transaction, request.sessionContext);
    return result;
  });
}

function isActiveShiftUniqueViolation(error: unknown): boolean {
  const databaseError = error as DatabaseError;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === activeShiftConstraint
  );
}

export function createStartShiftCommandExecutor(
  pool: PostgresPool,
  options: StartShiftCommandOptions = {},
): (request: StartShiftCommandRequest) => Promise<ShiftResult> {
  return async (request) => {
    try {
      const result = await attemptStart(pool, request, options);
      if ("denied" in result) throw new ShiftPresenceError(result.denied);
      return result;
    } catch (error) {
      if (!isActiveShiftUniqueViolation(error))
        throw presenceDatabaseError(error);
      // attemptStart already rolled back the failed transaction. Recovery and
      // authoritative classification therefore run in a fresh transaction.
      try {
        const recovered = await recoverConcurrentStart(pool, request, options);
        if ("denied" in recovered)
          throw new ShiftPresenceError(recovered.denied);
        return recovered;
      } catch (recoveryError) {
        throw presenceDatabaseError(recoveryError);
      }
    }
  };
}
