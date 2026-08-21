import type { PostgresTransaction } from "../../common/database/postgres";

export interface AuthorizedDashboardLocation {
  readonly locationId: string;
  readonly name: string;
  readonly organizationId: string;
}

export async function listAuthorizedDashboardLocations(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
): Promise<AuthorizedDashboardLocation[]> {
  const result = await transaction.query<AuthorizedDashboardLocation>(
    `SELECT location.id::text AS "locationId",
            location.name AS "name",
            organization.id::text AS "organizationId"
     FROM users AS actor
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     WHERE actor.id = $1 AND actor.status = 'ACTIVE'
     ORDER BY location.name ASC, location.id ASC`,
    [authenticatedUserId],
  );
  return result.rows;
}
