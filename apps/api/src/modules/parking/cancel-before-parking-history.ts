import type { CancelBeforeParkingResponse } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import { CustodyMutationError } from "../valet-sessions/protected-custody-command";
import type { ParkingCancellationTarget } from "./cancel-before-parking-types";

export async function coherentParkingCancellation(
  tx: PostgresTransaction,
  target: ParkingCancellationTarget,
  shiftId: string,
): Promise<CancelBeforeParkingResponse> {
  const { session, task, actorMembershipId } = target;
  if (
    session.state !== "CANCELLED" ||
    task.status !== "CANCELLED" ||
    !session.completed_intake ||
    !session.no_custody
  )
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  const rows = await tx.query<{ occurred_at: Date; coherent: boolean }>(
    `SELECT a.occurred_at,
      (a.entity_type='ValetSession' AND a.entity_id=$1::uuid
       AND a.actor_type='MEMBERSHIP' AND a.actor_membership_id=$4::uuid
       AND $5::int>1 AND $6::int>1
       AND a.metadata_json->>'fromTaskStatus' IN ('QUEUED','ASSIGNED','ACCEPTED')
       AND ((a.metadata_json->>'fromTaskStatus'='QUEUED' AND $9::uuid IS NULL)
         OR (a.metadata_json->>'fromTaskStatus' IN ('ASSIGNED','ACCEPTED') AND $9::uuid IS NOT NULL))
       AND a.metadata_json=jsonb_build_object(
         'taskId',$7::uuid::text,'shiftId',$8::uuid::text,
         'fromSessionState','AWAITING_PARKING','toSessionState','CANCELLED',
         'fromSessionVersion',$5::int-1,'toSessionVersion',$5::int,
         'fromTaskStatus',a.metadata_json->>'fromTaskStatus','toTaskStatus','CANCELLED',
         'fromTaskVersion',$6::int-1,'toTaskVersion',$6::int)
       AND (SELECT count(*)=1 AND bool_and(
         actor_membership_id=$4::uuid AND occurred_at=a.occurred_at
         AND previous_assignee_membership_id IS NOT DISTINCT FROM $9::uuid
         AND new_assignee_membership_id IS NOT DISTINCT FROM $9::uuid
         AND reason IS NULL AND organization_id=$2::uuid AND location_id=$3::uuid
         AND valet_session_id=$1::uuid)
         FROM dispatch_events WHERE task_id=$7::uuid AND event_type='CANCELLED')
       AND NOT EXISTS(SELECT 1 FROM tasks WHERE valet_session_id=$1::uuid
         AND status IN ('QUEUED','ASSIGNED','ACCEPTED','IN_PROGRESS'))
      ) AS coherent
     FROM audit_events a WHERE valet_session_id=$1::uuid AND organization_id=$2::uuid
       AND location_id=$3::uuid AND event_type='VALET_SESSION_PRE_CUSTODY_CANCELLED'`,
    [
      session.id,
      session.organization_id,
      session.location_id,
      actorMembershipId,
      session.version,
      task.version,
      task.id,
      shiftId,
      task.current_assignee_membership_id,
    ],
  );
  if (rows.rows.length !== 1 || rows.rows[0]?.coherent !== true)
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  return {
    sessionId: session.id,
    sessionVersion: session.version,
    state: "CANCELLED",
    taskId: task.id,
    taskVersion: task.version,
    taskStatus: "CANCELLED",
    cancelledAt: rows.rows[0].occurred_at.toISOString(),
  };
}
