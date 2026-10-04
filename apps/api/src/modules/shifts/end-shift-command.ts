import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import type { ShiftPresenceEvidence } from "@valet/contracts";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  guardPresenceShiftIntent,
  presenceDatabaseError,
  recheckPresenceShiftSession,
} from "./shift-presence-security";
import {
  preparePresenceShiftAttempt,
  recoverPresenceShiftAttempt,
} from "./shift-presence-command";
import { ShiftPresenceError } from "./shift-presence-errors";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { appendShiftAuditEvent } from "./shift-audit-event-writer";
import { requireActiveShiftUser } from "./shift-authorization";
import { ShiftOperationError } from "./shift-errors";
import { formatShiftMoney, parseShiftMoney } from "./shift-money";
import {
  inShiftTransaction,
  loadShiftOperationTime,
} from "./shift-transaction";
import {
  type PersistedShiftRow,
  type ShiftResult,
  toShiftResult,
} from "./shift-types";

export interface EndShiftCommandRequest {
  readonly authenticatedUserId: string;
  readonly cashReported: string;
  readonly shiftId: string;
  readonly presence?: ShiftPresenceEvidence;
  readonly operationId?: string;
  readonly sessionContext?: StaffSessionContext;
}

interface EndShiftCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly presenceFingerprintKey?: Uint8Array;
}

interface OwnedShiftScope {
  readonly currency: string;
  readonly location_id: string;
  readonly membership_id: string;
  readonly organization_id: string;
}

const shiftColumns = `id::text, organization_id::text, location_id::text,
  membership_id::text, status::text, started_at, ended_at,
  cash_expected::text, cash_reported::text, cash_variance::text,
  cash_currency, cash_reported_at`;

async function resolveOwnedShift(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
): Promise<OwnedShiftScope> {
  const result = await transaction.query<OwnedShiftScope>(
    `SELECT shift_row.organization_id::text, shift_row.location_id::text,
            shift_row.membership_id::text, location.currency
     FROM shifts AS shift_row
     INNER JOIN organization_memberships AS membership
      ON membership.organization_id = shift_row.organization_id
      AND membership.id = shift_row.membership_id
      AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
     INNER JOIN locations AS location
       ON location.organization_id = shift_row.organization_id
      AND location.id = shift_row.location_id
     WHERE shift_row.id = $1 AND membership.user_id = $2
     FOR SHARE OF membership, location`,
    [request.shiftId, request.authenticatedUserId],
  );
  const scope = result.rows[0];
  if (scope === undefined)
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  return scope;
}

async function requireNoCanonicalOpenTasks(
  transaction: PostgresTransaction,
  scope: OwnedShiftScope,
): Promise<void> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND current_assignee_membership_id = $3
       AND status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     LIMIT 1`,
    [scope.organization_id, scope.location_id, scope.membership_id],
  );
  if (result.rows[0] !== undefined) {
    throw new ShiftOperationError("OPEN_TASK_HANDOFF_REQUIRED");
  }
}

async function lockOwnedShift(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
  scope: OwnedShiftScope,
): Promise<PersistedShiftRow> {
  const result = await transaction.query<PersistedShiftRow>(
    `SELECT ${shiftColumns}
     FROM shifts
     WHERE id = $1 AND organization_id = $2 AND membership_id = $3
     FOR UPDATE`,
    [request.shiftId, scope.organization_id, scope.membership_id],
  );
  const shift = result.rows[0];
  if (shift === undefined)
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  return shift;
}

async function deriveCashExpected(
  transaction: PostgresTransaction,
  shift: PersistedShiftRow,
  operationTime: Date,
): Promise<bigint> {
  const result = await transaction.query<{ cash_expected: string }>(
    `WITH attributed_payments AS (
       SELECT DISTINCT receipt.payment_id
       FROM cash_entries AS receipt
       INNER JOIN payments AS payment
         ON payment.organization_id = receipt.organization_id
        AND payment.id = receipt.payment_id
       WHERE receipt.organization_id = $1
         AND payment.location_id = $2
         AND receipt.received_or_adjusted_by_membership_id = $3
         AND receipt.entry_type = 'RECEIPT'
         AND receipt.occurred_at >= $4 AND receipt.occurred_at <= $5
     )
     SELECT COALESCE(sum(CASE
              WHEN entry.entry_type = 'ADJUSTMENT_DECREASE' THEN -entry.amount
              ELSE entry.amount END), 0)::text AS cash_expected
     FROM cash_entries AS entry
     INNER JOIN attributed_payments ON attributed_payments.payment_id = entry.payment_id
     WHERE entry.organization_id = $1
       AND entry.occurred_at >= $4 AND entry.occurred_at <= $5`,
    [
      shift.organization_id,
      shift.location_id,
      shift.membership_id,
      shift.started_at,
      operationTime,
    ],
  );
  return parseShiftMoney(result.rows[0]?.cash_expected ?? "0");
}

export function createEndShiftCommandExecutor(
  pool: PostgresPool,
  options: EndShiftCommandOptions = {},
): (request: EndShiftCommandRequest) => Promise<ShiftResult> {
  return async (request) => {
    const outcome = await inShiftTransaction(pool, async (transaction) => {
      const result = await endInTransaction(transaction, request, options);
      await recheckPresenceShiftSession(transaction, request.sessionContext);
      return result;
    }).catch((error) => {
      throw presenceDatabaseError(error);
    });
    if ("denied" in outcome) throw new ShiftPresenceError(outcome.denied);
    return outcome;
  };
}

async function endInTransaction(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
  options: EndShiftCommandOptions,
) {
  await guardPresenceShiftIntent(transaction, request);
  await requireActiveShiftUser(transaction, request.authenticatedUserId);
  const scope = await resolveOwnedShift(transaction, request);
  const shift = await lockOwnedShift(transaction, request, scope);
  const attempt = {
    userId: request.authenticatedUserId,
    membershipId: scope.membership_id,
    organizationId: scope.organization_id,
    locationId: scope.location_id,
    action: "END" as const,
    shiftId: shift.id,
    cashReported: request.cashReported,
    ...(request.operationId === undefined
      ? {}
      : { operationId: request.operationId }),
    ...(request.presence === undefined ? {} : { evidence: request.presence }),
  };
  const recovery = await recoverPresenceShiftAttempt(
    transaction,
    attempt,
    options.presenceFingerprintKey,
  );
  if (recovery !== undefined) return recovery;
  if (shift.status === "ENDED") {
    if (shift.cash_reported_at === null) {
      throw new ShiftOperationError("SHIFT_CASH_RECONCILIATION_UNAVAILABLE");
    }
    return toShiftResult(shift);
  }
  const cashReported = parseShiftMoney(request.cashReported);
  if (!isCurrencyAmountRepresentable(scope.currency, cashReported)) {
    throw new ShiftOperationError("SHIFT_CASH_REPORT_INVALID");
  }
  await requireNoCanonicalOpenTasks(transaction, scope);
  const presence = await preparePresenceShiftAttempt(
    transaction,
    attempt,
    options.presenceFingerprintKey,
  );
  if ("denied" in presence) return { denied: presence.denied! };
  const operationTime = await loadShiftOperationTime(transaction);
  const cashExpected = await deriveCashExpected(
    transaction,
    shift,
    operationTime,
  );
  const result = await transaction.query<PersistedShiftRow>(
    `UPDATE shifts
         SET status = 'ENDED', ended_at = $2,
             cash_expected = $3::numeric, cash_reported = $4::numeric,
             cash_variance = $5::numeric, cash_currency = $6,
             cash_reported_at = $2,
             cash_reported_by_membership_id = membership_id
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING ${shiftColumns}`,
    [
      shift.id,
      operationTime,
      formatShiftMoney(cashExpected),
      formatShiftMoney(cashReported),
      formatShiftMoney(cashReported - cashExpected),
      scope.currency,
    ],
  );
  const endedShift = result.rows[0];
  if (endedShift === undefined) {
    throw new Error("Locked Shift end mutation did not succeed.");
  }
  await presence.commit(endedShift.id);
  await appendShiftAuditEvent(
    transaction,
    {
      cashReconciliation: toShiftResult(endedShift).cashReconciliation!,
      eventType: "SHIFT_ENDED",
      locationId: endedShift.location_id,
      membershipId: endedShift.membership_id,
      occurredAt: operationTime,
      organizationId: endedShift.organization_id,
      shiftId: endedShift.id,
    },
    options.auditEventIdFactory,
  );
  return toShiftResult(endedShift);
}
