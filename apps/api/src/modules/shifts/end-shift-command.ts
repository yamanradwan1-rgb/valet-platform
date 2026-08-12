import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendShiftAuditEvent } from "./shift-audit-event-writer";
import { requireActiveShiftUser } from "./shift-authorization";
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

export interface EndShiftCommandRequest {
  readonly authenticatedUserId: string;
  readonly shiftId: string;
}

interface EndShiftCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

interface OwnedShiftScope {
  readonly membership_id: string;
  readonly organization_id: string;
}

async function resolveOwnedShift(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
): Promise<OwnedShiftScope> {
  const result = await transaction.query<OwnedShiftScope>(
    `SELECT shift_row.organization_id::text, shift_row.membership_id::text
     FROM shifts AS shift_row
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = shift_row.organization_id
      AND membership.id = shift_row.membership_id
     WHERE shift_row.id = $1 AND membership.user_id = $2`,
    [request.shiftId, request.authenticatedUserId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

async function lockOwnedMembership(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
  scope: OwnedShiftScope,
): Promise<void> {
  const result = await transaction.query(
    `SELECT id
     FROM organization_memberships
     WHERE organization_id = $1 AND id = $2 AND user_id = $3
     FOR SHARE`,
    [scope.organization_id, scope.membership_id, request.authenticatedUserId],
  );
  if (result.rows[0] === undefined) {
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  }
}

async function lockOwnedShift(
  transaction: PostgresTransaction,
  request: EndShiftCommandRequest,
  scope: OwnedShiftScope,
): Promise<PersistedShiftRow> {
  const result = await transaction.query<PersistedShiftRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            membership_id::text, status::text, started_at, ended_at
     FROM shifts
     WHERE id = $1 AND organization_id = $2 AND membership_id = $3
     FOR UPDATE`,
    [request.shiftId, scope.organization_id, scope.membership_id],
  );
  const shift = result.rows[0];
  if (shift === undefined) {
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  }
  return shift;
}

export function createEndShiftCommandExecutor(
  pool: PostgresPool,
  options: EndShiftCommandOptions = {},
): (request: EndShiftCommandRequest) => Promise<ShiftResult> {
  return async (request) =>
    inShiftTransaction(pool, async (transaction) => {
      await requireActiveShiftUser(transaction, request.authenticatedUserId);
      const scope = await resolveOwnedShift(transaction, request);
      await lockOwnedMembership(transaction, request, scope);
      const shift = await lockOwnedShift(transaction, request, scope);
      if (shift.status === "ENDED") return toShiftResult(shift);

      const operationTime = await loadShiftOperationTime(transaction);
      const result = await transaction.query<PersistedShiftRow>(
        `UPDATE shifts
         SET status = 'ENDED', ended_at = $2
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING id::text, organization_id::text, location_id::text,
                   membership_id::text, status::text, started_at, ended_at`,
        [shift.id, operationTime],
      );
      const endedShift = result.rows[0];
      if (endedShift === undefined) {
        throw new Error("Locked Shift end mutation did not succeed.");
      }
      await appendShiftAuditEvent(
        transaction,
        {
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
    });
}
