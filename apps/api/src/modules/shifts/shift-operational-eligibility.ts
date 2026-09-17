import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";

export interface ShiftOperationalEligibility {
  readonly shiftId: string;
}

/**
 * Locks every persisted fact that makes a membership eligible. Callers must
 * keep this transaction open through their protected write.
 */
export async function lockShiftOperationalEligibility(
  transaction: PostgresTransaction,
  input: {
    readonly locationId: string;
    readonly membershipId: string;
  },
): Promise<ShiftOperationalEligibility | null> {
  await lockLocationLifecycle(transaction, input.locationId, "SHARED");
  const result = await transaction.query<{ shift_id: string }>(
    `SELECT shift_row.id::text AS shift_id
     FROM organization_memberships AS membership
     INNER JOIN users AS user_row
       ON user_row.id = membership.user_id
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
     INNER JOIN membership_location_access AS access_row
       ON access_row.organization_id = organization.id
      AND access_row.membership_id = membership.id
      AND access_row.location_id = location.id
     INNER JOIN shifts AS shift_row
       ON shift_row.organization_id = organization.id
      AND shift_row.membership_id = membership.id
      AND shift_row.location_id = location.id
      AND shift_row.status = 'ACTIVE'
     WHERE membership.id = $1
       AND membership.status = 'ACTIVE'
       AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND user_row.status = 'ACTIVE'
       AND organization.status = 'ACTIVE'
       AND location.status = 'ACTIVE'
     FOR SHARE OF membership, user_row, organization, location,
                  access_row, shift_row`,
    [input.membershipId, input.locationId],
  );
  const shiftId = result.rows[0]?.shift_id;
  return shiftId === undefined ? null : { shiftId };
}
