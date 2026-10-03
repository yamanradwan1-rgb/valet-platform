import type {
  ParkingSpotValidationQuery,
  ParkingSpotValidationResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inDispatchTransaction } from "../dispatch/dispatch-transaction";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { ConfirmParkedError } from "./confirm-parked-errors";
import { assertConfirmParkedGuards } from "./confirm-parked-guards";
import { resolveConfirmActor } from "./confirm-parked-locks";
import type {
  LockedConfirmSession,
  LockedConfirmTask,
} from "./confirm-parked-types";
import { readParkingSpotAvailability } from "./parking-spot-availability";

type Request = ParkingSpotValidationQuery & {
  readonly authenticatedUserId: string;
  readonly sessionId: string;
};

function forbidden(): never {
  throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
}

export function createParkingSpotValidationQuery(pool: PostgresPool) {
  return (request: Request): Promise<ParkingSpotValidationResponse> =>
    inDispatchTransaction(pool, async (transaction) => {
      const sessions = await transaction.query<LockedConfirmSession>(
        `SELECT id::text, organization_id::text, location_id::text,
                key_slot_id::text, parking_zone_id::text, parking_spot_id::text,
                state::text, version, parking_started_at, parked_at
         FROM valet_sessions WHERE id = $1 FOR SHARE`,
        [request.sessionId],
      );
      const session = sessions.rows[0];
      if (session === undefined) forbidden();
      const membershipId = await resolveConfirmActor(
        transaction,
        session,
        request.authenticatedUserId,
      );
      const tasks = await transaction.query<LockedConfirmTask>(
        `SELECT id::text, organization_id::text, location_id::text,
                valet_session_id::text, status::text,
                current_assignee_membership_id::text, version
         FROM tasks WHERE id = $1 AND valet_session_id = $2
           AND organization_id = $3 AND location_id = $4 AND task_type = 'PARKING'
         FOR SHARE`,
        [
          request.taskId,
          session.id,
          session.organization_id,
          session.location_id,
        ],
      );
      const task = tasks.rows[0];
      if (
        task === undefined ||
        task.current_assignee_membership_id !== membershipId
      )
        forbidden();
      const eligibility = await lockShiftOperationalEligibility(transaction, {
        locationId: session.location_id,
        membershipId,
      });
      if (
        eligibility === null ||
        eligibility.shiftId !== request.expectedShiftId
      )
        forbidden();
      assertConfirmParkedGuards(session, task, request);
      const spot = await readParkingSpotAvailability(
        transaction,
        session,
        request.parkingSpotCode,
        request.parkingSpotId,
      );
      return {
        available: true,
        sessionId: session.id,
        taskId: task.id,
        sessionVersion: session.version,
        taskVersion: task.version,
        parkingSpotId: spot.id,
        parkingSpotCode: spot.code,
        parkingZoneId: spot.parking_zone_id,
      };
    });
}
