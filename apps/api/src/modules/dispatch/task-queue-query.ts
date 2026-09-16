import type { StaffTaskQueueItem } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { DispatchOperationError } from "./dispatch-errors";
import { inDispatchTransaction } from "./dispatch-transaction";
import type { StaffTaskQueueItemRow } from "./dispatch-types";
import { toStaffTaskQueueItem } from "./dispatch-types";

export function createTaskQueueQuery(pool: PostgresPool) {
  return (request: {
    readonly authenticatedUserId: string;
    readonly locationId: string;
  }): Promise<StaffTaskQueueItem[]> =>
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
      const tasks = await transaction.query<StaffTaskQueueItemRow>(
        `SELECT
           task.id::text AS id,
           task.organization_id::text AS organization_id,
           task.location_id::text AS location_id,
           task.valet_session_id::text AS valet_session_id,
           task.task_type::text AS task_type,
           task.status::text AS status,
           task.current_assignee_membership_id::text AS current_assignee_membership_id,
           task.version AS version,
           task.created_at AS created_at,
           task.updated_at AS updated_at,
           session.parking_zone_id::text AS session_parking_zone_id,
           session.parking_spot_id::text AS session_parking_spot_id,
           session.state::text AS session_state,
           session.version AS session_version,
           vehicle.make AS vehicle_make,
           vehicle.model AS vehicle_model,
           vehicle.color AS vehicle_color,
           vehicle.plate_number_raw AS vehicle_plate_number_raw,
           vehicle.temporary_descriptor AS vehicle_temporary_descriptor,
           zone.label AS parking_zone_label,
           spot.label AS parking_spot_label,
           session.retrieval_requested_at AS retrieval_requested_at,
           COALESCE(location.employee_retrieval_requested_notification_enabled_override,
                    organization.employee_retrieval_requested_notification_enabled)
             AS retrieval_notification_enabled
         FROM tasks AS task
         INNER JOIN valet_sessions AS session
           ON session.id = task.valet_session_id
          AND session.organization_id = task.organization_id
          AND session.location_id = task.location_id
         INNER JOIN vehicles AS vehicle
           ON vehicle.id = session.vehicle_id
          AND vehicle.organization_id = session.organization_id
         INNER JOIN locations AS location
           ON location.id = task.location_id
          AND location.organization_id = task.organization_id
         INNER JOIN organizations AS organization
           ON organization.id = task.organization_id
         LEFT JOIN parking_zones AS zone
           ON zone.id = session.parking_zone_id
          AND zone.organization_id = session.organization_id
          AND zone.location_id = session.location_id
         LEFT JOIN parking_spots AS spot
           ON spot.id = session.parking_spot_id
          AND spot.parking_zone_id = session.parking_zone_id
          AND spot.organization_id = session.organization_id
          AND spot.location_id = session.location_id
         WHERE task.location_id = $1
           AND task.task_type IN ('PARKING', 'RETRIEVAL')
           AND task.status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
         ORDER BY task.created_at, task.id`,
        [request.locationId],
      );
      return tasks.rows.map(toStaffTaskQueueItem);
    });
}
