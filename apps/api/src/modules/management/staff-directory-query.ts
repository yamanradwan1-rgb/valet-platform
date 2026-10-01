import type { StaffDirectoryQuery } from "@valet/contracts";
import type { StaffDirectoryCursor } from "./staff-management-cursor";

export function staffDirectorySql(
  organizationId: string,
  query: StaffDirectoryQuery,
  cursor: StaffDirectoryCursor | null,
) {
  const values: unknown[] = [organizationId];
  const predicates = ["membership.organization_id = $1::uuid"];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/gu, "\\$&")}%`;
    const p = parameter(pattern);
    predicates.push(`(
      membership.first_name ILIKE ${p} ESCAPE '\\'
      OR membership.last_name ILIKE ${p} ESCAPE '\\'
      OR (membership.first_name || ' ' || membership.last_name) ILIKE ${p} ESCAPE '\\'
      OR staff_user.email ILIKE ${p} ESCAPE '\\'
    )`);
  }
  if (query.role)
    predicates.push(
      `membership.role = ${parameter(query.role)}::membership_role`,
    );
  if (query.status)
    predicates.push(
      `membership.status = ${parameter(query.status)}::membership_status`,
    );
  if (query.locationId) {
    predicates.push(`EXISTS (
      SELECT 1 FROM membership_location_access AS access
      WHERE access.organization_id = membership.organization_id
        AND access.membership_id = membership.id
        AND access.location_id = ${parameter(query.locationId)}::uuid
    )`);
  }
  if (cursor) {
    predicates.push(`(membership.created_at, membership.id) >
      (${parameter(cursor.createdAt)}::timestamptz, ${parameter(cursor.membershipId)}::uuid)`);
  }
  const limit = parameter(query.limit + 1);
  return {
    values,
    text: `WITH page AS (
      SELECT membership.id, membership.organization_id, membership.role,
             membership.status, membership.version, membership.created_at,
             membership.first_name, membership.last_name, staff_user.email
      FROM organization_memberships AS membership
      INNER JOIN users AS staff_user ON staff_user.id = membership.user_id
      WHERE ${predicates.join(" AND ")}
      ORDER BY membership.created_at, membership.id
      LIMIT ${limit}
    )
    SELECT page.id::text AS "membershipId",
           page.role::text AS role, page.status::text AS status,
           page.version, page.created_at AS "createdAt",
           jsonb_build_object('email', page.email, 'firstName', page.first_name,
             'lastName', page.last_name) AS identity,
           (SELECT count(*)::integer FROM membership_location_access AS access
            WHERE access.membership_id = page.id
              AND access.organization_id = page.organization_id) AS "locationAccessCount"
    FROM page ORDER BY page.created_at, page.id`,
  };
}
