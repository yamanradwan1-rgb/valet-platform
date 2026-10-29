import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

/** Only the existing Tasks list may use this Supervisor-specific read grant. */
export async function authorizeSupervisorEmergencyTasksScope(
  transaction: PostgresTransaction,
  context: StaffSessionContext | undefined,
  authenticatedUserId: string,
  locationId: string,
): Promise<DashboardLocationScope | null> {
  if (context === undefined || context.userId !== authenticatedUserId)
    return null;
  // Keep the current credential locked before Location/membership eligibility.
  // The takeover writer also acquires StaffSession before Location lifecycle.
  if (
    (await lockAndRecheckStaffSessionContext(transaction, context)) ===
    undefined
  )
    return null;
  await lockLocationLifecycle(transaction, locationId, "SHARED");
  const result = await transaction.query<{
    readonly membershipId: string;
    readonly organizationId: string;
  }>(
    `SELECT membership.id::text AS "membershipId",
            organization.id::text AS "organizationId"
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = organization.id
      AND membership.user_id = $2
      AND membership.status = 'ACTIVE'
      AND membership.role = 'VALET_SUPERVISOR'
     INNER JOIN users AS staff_user
       ON staff_user.id = membership.user_id
      AND staff_user.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access_row
       ON access_row.organization_id = organization.id
      AND access_row.location_id = location.id
      AND access_row.membership_id = membership.id
     INNER JOIN shifts AS shift_row
       ON shift_row.organization_id = organization.id
      AND shift_row.location_id = location.id
      AND shift_row.membership_id = membership.id
      AND shift_row.status = 'ACTIVE'
     WHERE location.id = $1 AND location.status = 'ACTIVE'
     FOR SHARE OF organization, location, membership, staff_user,
                  access_row, shift_row`,
    [locationId, context.userId],
  );
  const actor = result.rows[0];
  if (result.rowCount !== 1 || actor === undefined) return null;
  return {
    locationId,
    membershipId: actor.membershipId,
    organizationId: actor.organizationId,
  };
}
