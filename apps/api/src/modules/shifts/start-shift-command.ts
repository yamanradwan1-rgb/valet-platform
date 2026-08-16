import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

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
}

interface StartShiftCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly shiftIdFactory?: () => string;
}

const activeShiftConstraint = "shifts_one_active_per_membership_idx";

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
): Promise<ShiftResult> {
  return inShiftTransaction(pool, async (transaction) => {
    const scope = await authorizeShiftStart(transaction, request);
    const activeShift = await loadActiveMembershipShift(
      transaction,
      scope.membershipId,
    );
    return activeShift === undefined
      ? createShift(transaction, scope, options)
      : classifyActiveShift(activeShift, scope.locationId);
  });
}

async function recoverConcurrentStart(
  pool: PostgresPool,
  request: StartShiftCommandRequest,
): Promise<ShiftResult> {
  return inShiftTransaction(pool, async (transaction) => {
    const scope = await authorizeShiftStart(transaction, request);
    const activeShift = await loadActiveMembershipShift(
      transaction,
      scope.membershipId,
    );
    if (activeShift === undefined) {
      throw new Error("Concurrent Shift start could not be recovered.");
    }
    return classifyActiveShift(activeShift, scope.locationId);
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
      return await attemptStart(pool, request, options);
    } catch (error) {
      if (!isActiveShiftUniqueViolation(error)) throw error;
      // attemptStart already rolled back the failed transaction. Recovery and
      // authoritative classification therefore run in a fresh transaction.
      return recoverConcurrentStart(pool, request);
    }
  };
}
