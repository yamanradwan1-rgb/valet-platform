import type { PostgresTransaction } from "../../common/database/postgres";
import type { PresenceOperationRow } from "./shift-presence-operation";
import { presenceRecoveryWindow } from "./shift-presence-retention";
import { ShiftPresenceError } from "./shift-presence-errors";
import { toShiftResult, type PersistedShiftRow } from "./shift-types";

export async function presenceOperationResultProjection(
  transaction: PostgresTransaction,
  row: PresenceOperationRow,
) {
  const { rows } = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  if (row.status === "PENDING")
    return {
      operationId: row.operation_id,
      state: row.expires_at > rows[0]!.now ? "PENDING" : "EXPIRED",
    };
  if (presenceRecoveryWindow(row.terminal_at, rows[0]!.now) !== "RECOVERABLE")
    return { operationId: row.operation_id, state: "EXPIRED" };
  let result: unknown = null;
  if (row.status === "COMMITTED") {
    const shift = await transaction.query<PersistedShiftRow>(
      `SELECT id::text,organization_id::text,location_id::text,membership_id::text,
      status::text,started_at,ended_at,cash_expected::text,cash_reported::text,cash_variance::text,cash_currency,cash_reported_at
      FROM shifts WHERE id=$1 AND organization_id=$2 AND location_id=$3 AND membership_id=$4`,
      [
        row.result_shift_id,
        row.organization_id,
        row.location_id,
        row.membership_id,
      ],
    );
    if (shift.rows[0] === undefined)
      throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
    const persisted = toShiftResult(shift.rows[0]);
    const base = {
      shiftId: persisted.shiftId,
      locationId: persisted.locationId,
      startedAt: persisted.startedAt.toISOString(),
      status: row.action === "START" ? "ACTIVE" : "ENDED",
      endedAt: row.action === "START" ? null : persisted.endedAt!.toISOString(),
    };
    if (row.action === "START") result = base;
    else {
      const cash = persisted.cashReconciliation;
      if (cash === null)
        throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
      result = {
        ...base,
        cashReconciliation: {
          ...cash,
          reportedAt: cash.reportedAt.toISOString(),
        },
      };
    }
  }
  return {
    operationId: row.operation_id,
    state: "RECOVERABLE",
    action: row.action,
    status: row.status,
    shiftId: row.result_shift_id,
    decisionId: row.result_decision_id,
    denialReason: row.denial_reason,
    result,
  };
}

export function presenceExceptionProjection(row: Record<string, unknown>) {
  return {
    exceptionId: row.id,
    locationId: row.location_id,
    action: row.action,
    shiftId: row.shift_id,
    reason: row.reason,
    status: row.status,
    revision: row.revision,
    requestedAt: (row.requested_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
    reviewedAt:
      row.reviewed_at === null ? null : (row.reviewed_at as Date).toISOString(),
    terminalAt:
      row.terminal_at === null ? null : (row.terminal_at as Date).toISOString(),
  };
}
