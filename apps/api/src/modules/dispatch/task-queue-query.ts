import type { PostgresPool } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { DispatchOperationError } from "./dispatch-errors";
import { inDispatchTransaction } from "./dispatch-transaction";
import type { LockedTaskRow, TaskProjection } from "./dispatch-types";
import { toTaskProjection } from "./dispatch-types";

export function createTaskQueueQuery(pool: PostgresPool) {
  return (request: {
    readonly authenticatedUserId: string;
    readonly locationId: string;
  }): Promise<TaskProjection[]> =>
    inDispatchTransaction(pool, async (transaction) => {
      const actor = await transaction.query<{ membership_id: string }>(
        `SELECT membership.id::text AS membership_id
         FROM locations AS location
         INNER JOIN organization_memberships AS membership
           ON membership.organization_id = location.organization_id
          AND membership.user_id = $2
         WHERE location.id = $1`,
        [request.locationId, request.authenticatedUserId],
      );
      const membershipId = actor.rows[0]?.membership_id;
      if (
        membershipId === undefined ||
        (await lockShiftOperationalEligibility(transaction, {
          locationId: request.locationId,
          membershipId,
        })) === null
      ) {
        throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
      }
      const tasks = await transaction.query<LockedTaskRow>(
        `SELECT id::text, organization_id::text, location_id::text,
           valet_session_id::text, task_type::text, status::text,
           current_assignee_membership_id::text, version, created_at, updated_at
         FROM tasks
         WHERE location_id = $1 AND task_type = 'PARKING'
           AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
         ORDER BY created_at, id`,
        [request.locationId],
      );
      return tasks.rows.map(toTaskProjection);
    });
}
