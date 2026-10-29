import { UnauthorizedException } from "@nestjs/common";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import { DispatchOperationError } from "./dispatch-errors";

export interface EmergencyTakeoverReadAuthority {
  readonly actorMembershipId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly status: "IN_PROGRESS";
  readonly version: number;
  readonly assigneeMembershipId: string | null;
  readonly sessionState: string;
}

interface TaskScopeRow {
  readonly id: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly taskType: EmergencyTakeoverReadAuthority["taskType"];
  readonly status: EmergencyTakeoverReadAuthority["status"];
  readonly version: number;
  readonly assigneeMembershipId: string | null;
  readonly sessionState: string;
}

function deny(): never {
  throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
}

/**
 * This narrow Task Details reader does not grant Dashboard commercial access,
 * ordinary Reassign authority, or physical vehicle release authority.
 */
export async function authorizeEmergencyTakeoverRead(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  taskId: string,
): Promise<EmergencyTakeoverReadAuthority> {
  // The first read is an untrusted lock-order hint. Never return it or use it
  // as authority: W2 writers lock Session before StaffSession and Task.
  const hints = await transaction.query<{
    readonly organizationId: string;
    readonly locationId: string;
    readonly sessionId: string;
  }>(
    `SELECT organization_id::text AS "organizationId",
            location_id::text AS "locationId",
            valet_session_id::text AS "sessionId"
     FROM tasks WHERE id = $1`,
    [taskId],
  );
  const hint = hints.rows[0];
  if (hints.rowCount !== 1 || !hint) deny();
  const scopedSession = await transaction.query(
    `SELECT 1 FROM valet_sessions
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR SHARE`,
    [hint.sessionId, hint.organizationId, hint.locationId],
  );
  if (scopedSession.rowCount !== 1) deny();

  if (!(await lockAndRecheckStaffSessionContext(transaction, context))) {
    throw new UnauthorizedException();
  }
  const taskRows = await transaction.query<TaskScopeRow>(
    `SELECT task.id::text AS id,
            task.organization_id::text AS "organizationId",
            task.location_id::text AS "locationId",
            task.valet_session_id::text AS "sessionId",
            task.task_type::text AS "taskType",
            task.status::text AS status,
            task.version,
            task.current_assignee_membership_id::text AS "assigneeMembershipId",
            session.state::text AS "sessionState"
     FROM tasks AS task
     INNER JOIN valet_sessions AS session
       ON session.id = task.valet_session_id
      AND session.organization_id = task.organization_id
      AND session.location_id = task.location_id
     INNER JOIN organizations AS organization
       ON organization.id = task.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.id = task.location_id
      AND location.organization_id = task.organization_id
      AND location.status = 'ACTIVE'
     WHERE task.id = $1
       AND task.valet_session_id = $2
       AND task.organization_id = $3 AND task.location_id = $4
       AND task.task_type IN ('PARKING', 'RETRIEVAL')
       AND task.status = 'IN_PROGRESS'
     FOR SHARE OF task, session, organization, location`,
    [taskId, hint.sessionId, hint.organizationId, hint.locationId],
  );
  const task = taskRows.rows[0];
  if (taskRows.rowCount !== 1 || !task) deny();

  const actors = await transaction.query<{
    readonly membershipId: string;
    readonly role: string;
  }>(
    `SELECT membership.id::text AS "membershipId",
            membership.role::text AS role
     FROM organization_memberships AS membership
     INNER JOIN users AS staff_user
       ON staff_user.id = membership.user_id
      AND staff_user.status = 'ACTIVE'
     WHERE membership.organization_id = $1
       AND membership.user_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role IN ('ORG_ADMIN','VALET_SUPERVISOR')
     FOR SHARE OF membership, staff_user`,
    [task.organizationId, context.userId],
  );
  const actor = actors.rows[0];
  if (actors.rowCount !== 1 || !actor) deny();

  if (actor.role === "VALET_SUPERVISOR") {
    const scope = await transaction.query(
      `SELECT 1 FROM membership_location_access AS access
       INNER JOIN shifts AS shift_row
         ON shift_row.organization_id = access.organization_id
        AND shift_row.location_id = access.location_id
        AND shift_row.membership_id = access.membership_id
        AND shift_row.status = 'ACTIVE'
       WHERE access.organization_id = $1
         AND access.location_id = $2
         AND access.membership_id = $3
       FOR SHARE OF access, shift_row`,
      [task.organizationId, task.locationId, actor.membershipId],
    );
    if (scope.rowCount !== 1) deny();
  } else if (actor.role === "ORG_ADMIN") {
    // Admin has no operational Shift and gains no field-release capability.
    await requireMfaAssuranceInTransaction(transaction, context, {
      sensitive: true,
    });
    await recordAdminActivityInTransaction(transaction, context);
  } else {
    deny();
  }
  return {
    actorMembershipId: actor.membershipId,
    organizationId: task.organizationId,
    locationId: task.locationId,
    sessionId: task.sessionId,
    taskId: task.id,
    taskType: task.taskType,
    status: task.status,
    version: task.version,
    assigneeMembershipId: task.assigneeMembershipId,
    sessionState: task.sessionState,
  };
}
