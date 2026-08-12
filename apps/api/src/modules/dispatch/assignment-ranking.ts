import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";

interface RankedMembership {
  readonly membershipId: string;
  readonly openTaskLoad: number;
}

export async function rankEligibleTaskAssignees(
  transaction: PostgresTransaction,
  input: { readonly locationId: string; readonly organizationId: string },
): Promise<RankedMembership[]> {
  const candidates = await transaction.query<{ membership_id: string }>(
    `SELECT membership.id::text AS membership_id
     FROM organization_memberships AS membership
     WHERE membership.organization_id = $1
       AND membership.status = 'ACTIVE'
       AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
     ORDER BY membership.id
     FOR UPDATE`,
    [input.organizationId],
  );
  const eligibleIds: string[] = [];
  for (const candidate of candidates.rows) {
    if (
      (await lockShiftOperationalEligibility(transaction, {
        locationId: input.locationId,
        membershipId: candidate.membership_id,
      })) !== null
    ) {
      eligibleIds.push(candidate.membership_id);
    }
  }
  if (eligibleIds.length === 0) return [];
  const loads = await transaction.query<{
    membership_id: string;
    open_task_load: string;
  }>(
    `SELECT candidate.membership_id::text,
            count(task.id)::text AS open_task_load
     FROM unnest($1::uuid[]) AS candidate(membership_id)
     LEFT JOIN tasks AS task
       ON task.organization_id = $2
      AND task.location_id = $3
      AND task.current_assignee_membership_id = candidate.membership_id
      AND task.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     GROUP BY candidate.membership_id
     ORDER BY count(task.id), candidate.membership_id`,
    [eligibleIds, input.organizationId, input.locationId],
  );
  return loads.rows.map((row) => ({
    membershipId: row.membership_id,
    openTaskLoad: Number(row.open_task_load),
  }));
}
