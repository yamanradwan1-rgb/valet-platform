import type { PostgresTransaction } from "../../common/database/postgres";
import { MapSetupError } from "./map-setup-errors";

export interface MapSetupActor {
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function authorizeLocationMapSetup(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  locationId: string,
): Promise<MapSetupActor> {
  const result = await transaction.query<MapSetupActor>(
    `SELECT membership.id::text AS "membershipId",
            membership.organization_id::text AS "organizationId"
     FROM users AS actor
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
      AND location.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
      AND access.location_id = location.id
     WHERE actor.id = $1 AND actor.status = 'ACTIVE'
     FOR SHARE OF actor, membership, organization, location, access`,
    [authenticatedUserId, locationId],
  );
  const actor = result.rows[0];
  if (actor === undefined) throw new MapSetupError("AUTHORIZATION_DENIED");
  return actor;
}
