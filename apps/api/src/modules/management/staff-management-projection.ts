import type {
  StaffDirectoryItem,
  StaffMembershipDetail,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";

export interface StaffMembershipRow extends StaffDirectoryItem {
  readonly createdAt: Date;
  readonly userId: string;
  readonly userStatus: "ACTIVE" | "DISABLED";
}

export async function loadStaffMembership(
  transaction: PostgresTransaction,
  organizationId: string,
  membershipId: string,
  lock = false,
): Promise<StaffMembershipRow> {
  const result = await transaction.query<StaffMembershipRow>(
    `SELECT membership.id::text AS "membershipId",
            membership.role::text AS role, membership.status::text AS status,
            membership.version, membership.created_at AS "createdAt",
            membership.user_id::text AS "userId", staff_user.status::text AS "userStatus",
            jsonb_build_object('email', staff_user.email,
              'firstName', membership.first_name,
              'lastName', membership.last_name) AS identity,
            (SELECT count(*)::integer FROM membership_location_access AS access
             WHERE access.membership_id = membership.id
               AND access.organization_id = membership.organization_id) AS "locationAccessCount"
     FROM organization_memberships AS membership
     INNER JOIN users AS staff_user ON staff_user.id = membership.user_id
     WHERE membership.id = $1 AND membership.organization_id = $2
       AND membership.status IN ('ACTIVE', 'INACTIVE')
     ${lock ? "FOR UPDATE OF membership" : ""}`,
    [membershipId, organizationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new ManagementAccessDeniedError();
  }
  return row;
}

interface LocationAccessRow {
  readonly locationId: string;
  readonly name: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly totalCount: number;
}

export async function staffMembershipDetail(
  transaction: PostgresTransaction,
  membership: StaffMembershipRow,
): Promise<StaffMembershipDetail> {
  const access = await transaction.query<LocationAccessRow>(
    `SELECT location.id::text AS "locationId", location.name,
            location.status::text AS status, count(*) OVER()::integer AS "totalCount"
     FROM membership_location_access AS access
     INNER JOIN locations AS location
       ON location.id = access.location_id
      AND location.organization_id = access.organization_id
     WHERE access.membership_id = $1
     ORDER BY location.name, location.id
     LIMIT 101`,
    [membership.membershipId],
  );
  const items = access.rows.slice(0, 100).map((row) => ({
    locationId: row.locationId,
    name: row.name,
    status: row.status,
  }));
  const totalCount = access.rows[0]?.totalCount ?? 0;
  return {
    identity: membership.identity,
    locationAccess: { items, totalCount, truncated: totalCount > 100 },
    locationAccessCount: membership.locationAccessCount,
    membershipId: membership.membershipId,
    role: membership.role,
    status: membership.status,
    version: membership.version,
  };
}
