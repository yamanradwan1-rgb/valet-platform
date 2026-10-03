import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { DispatchOperationError } from "../dispatch/dispatch-errors";
import type { LockedTaskRow } from "../dispatch/dispatch-types";
import type {
  ParkingCancellationAuthorityInput,
  ParkingCancellationSession,
  ParkingCancellationTarget,
} from "./cancel-before-parking-types";

function concealed(): never {
  throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
}
export async function authorizeParkingCancellation(
  tx: PostgresTransaction,
  input: ParkingCancellationAuthorityInput,
): Promise<ParkingCancellationTarget> {
  const initial = await tx.query<{
    organization_id: string;
    location_id: string;
    membership_id: string;
  }>(
    `SELECT s.organization_id::text, s.location_id::text, m.id::text AS membership_id
     FROM valet_sessions s JOIN tasks t ON t.valet_session_id=s.id
       AND t.organization_id=s.organization_id AND t.location_id=s.location_id
     JOIN organization_memberships m ON m.organization_id=s.organization_id
       AND m.user_id=$3
     WHERE s.id=$1 AND t.id=$2 AND t.task_type='PARKING'`,
    [input.sessionId, input.taskId, input.authenticatedUserId],
  );
  const scope = initial.rows[0];
  if (!scope) concealed();
  await lockLocationLifecycle(tx, scope.location_id, "SHARED");
  const locked = await tx.query<ParkingCancellationSession>(
    `SELECT id::text, organization_id::text, location_id::text,
       checked_in_by_membership_id::text, state::text, version, updated_at,
       checking_in_completed_at IS NOT NULL AS completed_intake,
       (parking_started_at IS NULL AND parked_at IS NULL
        AND retrieval_requested_at IS NULL AND retrieval_started_at IS NULL
        AND ready_at IS NULL AND handoff_pending_at IS NULL AND completed_at IS NULL
        AND completed_by_membership_id IS NULL AND current_assignee_membership_id IS NULL
        AND key_slot_id IS NULL AND parking_zone_id IS NULL AND parking_spot_id IS NULL
       ) AS no_custody
     FROM valet_sessions WHERE id=$1 AND organization_id=$2 AND location_id=$3
     FOR NO KEY UPDATE`,
    [input.sessionId, scope.organization_id, scope.location_id],
  );
  const session = locked.rows[0];
  if (!session) concealed();
  const taskRows = await tx.query<LockedTaskRow>(
    `SELECT id::text, organization_id::text, location_id::text,
       valet_session_id::text, task_type::text, status::text,
       current_assignee_membership_id::text, version, created_at, updated_at
     FROM tasks WHERE id=$1 AND valet_session_id=$2 AND organization_id=$3
       AND location_id=$4 AND task_type='PARKING' FOR UPDATE`,
    [input.taskId, session.id, session.organization_id, session.location_id],
  );
  const task = taskRows.rows[0];
  if (!task) concealed();
  const owner =
    task.current_assignee_membership_id ?? session.checked_in_by_membership_id;
  if (owner !== scope.membership_id) concealed();
  const eligibility = await lockShiftOperationalEligibility(tx, {
    locationId: session.location_id,
    membershipId: scope.membership_id,
  });
  if (eligibility?.shiftId !== input.expectedShiftId) concealed();
  const history = await tx.query<{ present: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM key_custody_events WHERE valet_session_id=$1)
       OR EXISTS(SELECT 1 FROM task_tracking_sessions WHERE valet_session_id=$1)
       OR EXISTS(SELECT 1 FROM retrieval_requests WHERE valet_session_id=$1)
       OR EXISTS(SELECT 1 FROM handoff_verifications WHERE valet_session_id=$1)
       AS present`,
    [session.id],
  );
  session.no_custody = session.no_custody && history.rows[0]?.present === false;
  return { session, task, actorMembershipId: scope.membership_id };
}

export function isPreCustody({
  session,
  task,
}: ParkingCancellationTarget): boolean {
  return (
    session.state === "AWAITING_PARKING" &&
    session.completed_intake &&
    session.no_custody &&
    ["QUEUED", "ASSIGNED", "ACCEPTED"].includes(task.status) &&
    (task.status !== "QUEUED" || task.current_assignee_membership_id === null)
  );
}
