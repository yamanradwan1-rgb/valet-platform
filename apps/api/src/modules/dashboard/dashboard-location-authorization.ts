import type { PostgresTransaction } from "../../common/database/postgres";

export interface DashboardLocationScope {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function authorizeDashboardLocation(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  targetLocationId: string,
): Promise<DashboardLocationScope | null> {
  const result = await transaction.query<DashboardLocationScope>(
    `SELECT organization.id::text AS "organizationId",
            location.id::text AS "locationId",
            membership.id::text AS "membershipId"
     FROM users AS actor
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2 AND location.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     WHERE actor.id = $1 AND actor.status = 'ACTIVE'
     LIMIT 1`,
    [authenticatedUserId, targetLocationId],
  );
  return result.rows[0] ?? null;
}
