// A membership is reached through a task in the already-authorized Location.
// Names belong to that membership; email comes from its linked account (#240).
export const operationalAssigneeColumn = `CASE WHEN assignee_user.id IS NULL THEN NULL
  ELSE jsonb_build_object('membershipId', assignee_member.id,
    'identity', jsonb_build_object('firstName', assignee_member.first_name,
      'lastName', assignee_member.last_name, 'email', assignee_user.email))
  END AS assignee`;

export function operationalAssigneeJoins(taskAlias: "task" | "current_task") {
  return `LEFT JOIN organization_memberships AS assignee_member
    ON assignee_member.organization_id = ${taskAlias}.organization_id
   AND assignee_member.id = ${taskAlias}.current_assignee_membership_id
   AND ${taskAlias}.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
  LEFT JOIN users AS assignee_user ON assignee_user.id = assignee_member.user_id`;
}
