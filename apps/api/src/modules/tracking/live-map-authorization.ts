import type { PostgresTransaction } from "../../common/database/postgres";

export interface LiveMapAuthorization {
  readonly locationId: string;
  readonly organizationId: string;
  readonly trackingEnabled: boolean;
}

export async function authorizeLiveMap(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  locationId: string,
): Promise<LiveMapAuthorization | null> {
  const result = await transaction.query<LiveMapAuthorization>(
    `SELECT organization.id::text AS "organizationId",
            location.id::text AS "locationId",
            COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS "trackingEnabled"
     FROM users AS actor
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id AND membership.status = 'ACTIVE'
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
       AND (
         membership.role = 'LOCATION_MANAGER'
         OR (
           membership.role = 'VALET_SUPERVISOR'
           AND EXISTS (
             SELECT 1 FROM shifts AS shift
             WHERE shift.organization_id = organization.id
               AND shift.location_id = location.id
               AND shift.membership_id = membership.id
               AND shift.status = 'ACTIVE'
           )
         )
       )`,
    [authenticatedUserId, locationId],
  );
  return result.rows[0] ?? null;
}
