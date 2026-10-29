import type { PostgresTransaction } from "../../common/database/postgres";
import { DispatchOperationError } from "./dispatch-errors";
import type {
  LockedEmergencySession,
  LockedEmergencyTask,
} from "./emergency-takeover-types";

export async function mutateEmergencyTaskOwner(
  tx: PostgresTransaction,
  task: LockedEmergencyTask,
  newAssigneeMembershipId: string,
  operationTime: Date,
): Promise<number> {
  const result = await tx.query<{ version: number }>(
    `UPDATE tasks SET current_assignee_membership_id=$7,
       version=version+1, updated_at=$8
     WHERE id=$1 AND organization_id=$2 AND location_id=$3
       AND valet_session_id=$4 AND status='IN_PROGRESS'
       AND version=$5 AND current_assignee_membership_id=$6
     RETURNING version`,
    [
      task.id,
      task.organization_id,
      task.location_id,
      task.valet_session_id,
      task.version,
      task.current_assignee_membership_id,
      newAssigneeMembershipId,
      operationTime,
    ],
  );
  const version = result.rows[0]?.version;
  if (result.rowCount !== 1 || version !== task.version + 1) {
    throw new DispatchOperationError("VERSION_CONFLICT");
  }
  return version;
}

/** Version advances exactly once, without changing physical ValetSession state. */
export async function advanceEmergencySessionVersion(
  tx: PostgresTransaction,
  session: LockedEmergencySession,
  operationTime: Date,
): Promise<number> {
  const result = await tx.query<{ version: number }>(
    `UPDATE valet_sessions SET version=version+1, updated_at=$6
     WHERE id=$1 AND organization_id=$2 AND location_id=$3
       AND version=$4 AND state::text=$5
     RETURNING version`,
    [
      session.id,
      session.organization_id,
      session.location_id,
      session.version,
      session.state,
      operationTime,
    ],
  );
  const version = result.rows[0]?.version;
  if (result.rowCount !== 1 || version !== session.version + 1) {
    throw new DispatchOperationError("VERSION_CONFLICT");
  }
  return version;
}
