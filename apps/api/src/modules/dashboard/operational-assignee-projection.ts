// A membership must be granted the task's exact already-authorized Location.
// Names belong to that membership; email comes from its linked account (#240).
export const operationalAssigneeColumn = `CASE WHEN assignee_user.id IS NULL THEN NULL
  ELSE jsonb_build_object('membershipId', assignee_member.id,
    'identity', jsonb_build_object('firstName', assignee_member.first_name,
      'lastName', assignee_member.last_name, 'email', assignee_user.email))
  END AS assignee`;

export function operationalAssigneeJoins(taskAlias: "task" | "current_task") {
  return assigneeJoins(taskAlias, "'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'");
}

// The Tasks history page retains an authorized assignment after completion.
// This is attribution to the task's persisted assignee, not its completion actor.
export function dashboardTasksHistoricalAssigneeJoins() {
  return assigneeJoins("task", "'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'");
}

function assigneeJoins(taskAlias: "task" | "current_task", statuses: string) {
  return `LEFT JOIN organization_memberships AS assignee_member
    ON assignee_member.organization_id = ${taskAlias}.organization_id
   AND assignee_member.id = ${taskAlias}.current_assignee_membership_id
   AND ${taskAlias}.status IN (${statuses})
   AND EXISTS (
     SELECT 1 FROM membership_location_access AS assignee_access
     WHERE assignee_access.organization_id = ${taskAlias}.organization_id
       AND assignee_access.membership_id = assignee_member.id
       AND assignee_access.location_id = ${taskAlias}.location_id
   )
  LEFT JOIN users AS assignee_user ON assignee_user.id = assignee_member.user_id`;
}
