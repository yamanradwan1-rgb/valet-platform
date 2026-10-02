import type {
  StaffShiftHistoryEntry,
  StaffShiftHistoryQuery,
} from "@valet/contracts";
import type { StaffManagementAuthority } from "./staff-management-authorization";
import type { HistoryCursorTuple } from "./staff-shift-history-cursor";

export interface StaffShiftHistoryRow extends Omit<
  StaffShiftHistoryEntry,
  "startedAt" | "endedAt"
> {
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/** No target lifecycle/role/grant predicate: historical authority belongs to the Shift Location. */
export function staffShiftHistorySql(
  authority: StaffManagementAuthority,
  query: StaffShiftHistoryQuery,
  cursor: HistoryCursorTuple | null,
  shiftId?: string,
) {
  const values: unknown[] = [authority.organizationId];
  const predicates = ["shift.organization_id = $1::uuid"];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (authority.activeLocationIds !== null) {
    predicates.push(
      `shift.location_id = ANY(${parameter(authority.activeLocationIds)}::uuid[])`,
    );
  }
  if (query.membershipId)
    predicates.push(
      `shift.membership_id = ${parameter(query.membershipId)}::uuid`,
    );
  if (query.locationId)
    predicates.push(`shift.location_id = ${parameter(query.locationId)}::uuid`);
  if (query.status)
    predicates.push(`shift.status = ${parameter(query.status)}::shift_status`);
  if (query.from)
    predicates.push(
      `shift.started_at >= ${parameter(query.from)}::timestamptz`,
    );
  if (query.to)
    predicates.push(`shift.started_at < ${parameter(query.to)}::timestamptz`);
  if (shiftId) predicates.push(`shift.id = ${parameter(shiftId)}::uuid`);
  if (cursor)
    predicates.push(
      `(shift.started_at, shift.id) < (${parameter(cursor.startedAt)}::timestamptz, ${parameter(cursor.id)}::uuid)`,
    );
  const limit = parameter(shiftId ? 1 : query.limit + 1);
  return {
    values,
    text: `SELECT shift.id::text AS "shiftId", shift.membership_id::text AS "membershipId",
      jsonb_build_object('firstName', membership.first_name, 'lastName', membership.last_name,
        'email', staff_user.email) AS identity,
      membership.role::text AS "currentRole",
      jsonb_build_object('locationId', location.id::text, 'name', location.name,
        'code', location.code, 'timezone', location.timezone) AS location,
      shift.status::text AS status, shift.started_at AS "startedAt", shift.ended_at AS "endedAt"
    FROM (
      SELECT shift.id, shift.organization_id, shift.membership_id, shift.location_id,
        shift.status, shift.started_at, shift.ended_at
      FROM shifts AS shift WHERE ${predicates.join(" AND ")}
      ORDER BY shift.started_at DESC, shift.id DESC LIMIT ${limit}
    ) AS shift
    INNER JOIN organization_memberships AS membership
      ON membership.id = shift.membership_id AND membership.organization_id = shift.organization_id
    INNER JOIN users AS staff_user ON staff_user.id = membership.user_id
    INNER JOIN locations AS location
      ON location.id = shift.location_id AND location.organization_id = shift.organization_id
    ORDER BY shift.started_at DESC, shift.id DESC`,
  };
}

export function shiftHistoryEntry(
  row: StaffShiftHistoryRow,
): StaffShiftHistoryEntry {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}
