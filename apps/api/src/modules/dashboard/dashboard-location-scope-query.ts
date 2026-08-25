import type { PostgresTransaction } from "../../common/database/postgres";

export interface AuthorizedDashboardLocation {
  readonly locationId: string;
  readonly name: string;
  readonly organizationId: string;
  /**
   * ISO-4217 alpha-3 currency enforced by the locations table CHECK
   * constraint. Projected for the D2-005 public authorized-location endpoint
   * so the dashboard no longer fabricates dev-only metadata.
   */
  readonly currency: string;
  /** IANA timezone column of the location row (NOT NULL in the schema). */
  readonly timezone: string;
}

/**
 * The single authorization source enumerating every location the actor may
 * manage on the dashboard: active actor, active LOCATION_MANAGER membership,
 * active organization, active location and an explicit
 * membership_location_access row. Ordered deterministically by location name
 * then id. Exposed publicly through DashboardLocationsController (D2-005);
 * never weaken these predicates.
 */
export async function listAuthorizedDashboardLocations(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
): Promise<AuthorizedDashboardLocation[]> {
  const result = await transaction.query<AuthorizedDashboardLocation>(
    `SELECT location.id::text AS "locationId",
            location.name AS "name",
            organization.id::text AS "organizationId",
            location.currency AS "currency",
            location.timezone AS "timezone"
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
