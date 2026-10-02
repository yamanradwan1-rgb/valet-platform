import type { StaffShiftEmployeeQuery } from "@valet/contracts";
import type { StaffManagementAuthority } from "./staff-management-authorization";
import type { HistoryCursorTuple } from "./staff-shift-history-cursor";

export function staffShiftEmployeeSql(
  authority: StaffManagementAuthority,
  query: StaffShiftEmployeeQuery,
  cursor: HistoryCursorTuple | null,
) {
  const values: unknown[] = [authority.organizationId];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const historyPredicates = [
    "shift.organization_id = membership.organization_id",
    "shift.membership_id = membership.id",
  ];
  if (authority.activeLocationIds !== null)
    historyPredicates.push(
      `shift.location_id = ANY(${parameter(authority.activeLocationIds)}::uuid[])`,
    );
  if (query.locationId)
    historyPredicates.push(
      `shift.location_id = ${parameter(query.locationId)}::uuid`,
    );
  const predicates = [
    "membership.organization_id = $1::uuid",
    `EXISTS (
    SELECT 1 FROM shifts AS shift
    INNER JOIN locations AS location ON location.id = shift.location_id AND location.organization_id = shift.organization_id
    WHERE ${historyPredicates.join(" AND ")}
  )`,
  ];
  if (query.search) {
    const pattern = parameter(`%${query.search.replace(/[\\%_]/gu, "\\$&")}%`);
    predicates.push(`(membership.first_name ILIKE ${pattern} ESCAPE '\\'
      OR membership.last_name ILIKE ${pattern} ESCAPE '\\'
      OR (membership.first_name || ' ' || membership.last_name) ILIKE ${pattern} ESCAPE '\\'
      OR staff_user.email ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (cursor) predicates.push(`membership.id > ${parameter(cursor.id)}::uuid`);
  const limit = parameter(query.limit + 1);
  return {
    values,
    text: `SELECT membership.id::text AS "membershipId",
    jsonb_build_object('firstName', membership.first_name, 'lastName', membership.last_name, 'email', staff_user.email) AS identity
    FROM organization_memberships AS membership
    INNER JOIN users AS staff_user ON staff_user.id = membership.user_id
    WHERE ${predicates.join(" AND ")}
    ORDER BY membership.id LIMIT ${limit}`,
  };
}
