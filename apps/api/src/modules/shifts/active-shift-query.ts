import type { PostgresPool } from "../../common/database/postgres";
import { requireActiveShiftUser } from "./shift-authorization";
import { inShiftTransaction } from "./shift-transaction";
import {
  type PersistedShiftRow,
  type ShiftResult,
  toShiftResult,
} from "./shift-types";

export interface ActiveShiftQueryRequest {
  readonly authenticatedUserId: string;
  readonly locationId: string;
}

export function createActiveShiftQuery(
  pool: PostgresPool,
): (request: ActiveShiftQueryRequest) => Promise<ShiftResult | null> {
  return async (request) =>
    inShiftTransaction(pool, async (transaction) => {
      await requireActiveShiftUser(transaction, request.authenticatedUserId);
      const result = await transaction.query<PersistedShiftRow>(
        `SELECT shift_row.id::text, shift_row.organization_id::text,
                shift_row.location_id::text, shift_row.membership_id::text,
                shift_row.status::text, shift_row.started_at,
                shift_row.ended_at
         FROM shifts AS shift_row
         INNER JOIN organization_memberships AS membership
           ON membership.organization_id = shift_row.organization_id
          AND membership.id = shift_row.membership_id
         WHERE membership.user_id = $1
           AND shift_row.location_id = $2
           AND shift_row.status = 'ACTIVE'
         FOR SHARE OF shift_row, membership`,
        [request.authenticatedUserId, request.locationId],
      );
      const shift = result.rows[0];
      return shift === undefined ? null : toShiftResult(shift);
    });
}
