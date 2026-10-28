import type { PostgresPool } from "../../common/database/postgres";

interface MembershipScope {
  readonly organization_id: string;
  readonly membership_id: string;
}

interface LocationRow {
  readonly membership_id: string;
  readonly location_id: string;
  readonly code: string;
  readonly currency: string;
  readonly name: string;
  readonly timezone: string;
}

interface ShiftRow {
  readonly membership_id: string;
  readonly shift_id: string;
  readonly location_id: string;
  readonly started_at: Date;
}

interface ProjectableShiftRow extends ShiftRow, LocationRow {}

/** Batch only persisted, authorized Organization/membership PAIRS, never a cross product. */
export async function loadOperationalMembershipDetails(
  pool: Pick<PostgresPool, "query">,
  memberships: readonly MembershipScope[],
) {
  const pairs = [
    memberships.map((membership) => membership.organization_id),
    memberships.map((membership) => membership.membership_id),
  ];
  const scope = `unnest($1::uuid[], $2::uuid[])
    AS scope(organization_id, membership_id)`;
  const locationsResult = await pool.query<LocationRow>(
    `SELECT access.membership_id::text AS membership_id,
            location.id::text AS location_id, location.name, location.code,
            location.currency, location.timezone
     FROM ${scope}
     INNER JOIN membership_location_access AS access
       ON access.organization_id = scope.organization_id
      AND access.membership_id = scope.membership_id
     INNER JOIN locations AS location
       ON location.id = access.location_id
      AND location.organization_id = access.organization_id
     WHERE location.status = 'ACTIVE'
     ORDER BY access.membership_id, location.id`,
    pairs,
  );
  // Existence is unconditional: a revoked grant must not turn a real Shift into null.
  const shiftsResult = await pool.query<ShiftRow>(
    `SELECT shift.membership_id::text AS membership_id,
            shift.id::text AS shift_id, shift.location_id::text AS location_id,
            shift.started_at
     FROM ${scope}
     INNER JOIN shifts AS shift
       ON shift.organization_id = scope.organization_id
      AND shift.membership_id = scope.membership_id
     WHERE shift.status = 'ACTIVE'`,
    pairs,
  );
  const projectable = new Map<string, ProjectableShiftRow>();
  if (shiftsResult.rows.length > 0) {
    const result = await pool.query<ProjectableShiftRow>(
      `SELECT shift.membership_id::text AS membership_id,
              shift.id::text AS shift_id, shift.location_id::text AS location_id,
              shift.started_at, location.name, location.code,
              location.currency, location.timezone
       FROM ${scope}
       INNER JOIN shifts AS shift
         ON shift.organization_id = scope.organization_id
        AND shift.membership_id = scope.membership_id
       INNER JOIN locations AS location
         ON location.id = shift.location_id
        AND location.organization_id = shift.organization_id
       INNER JOIN membership_location_access AS access
         ON access.organization_id = shift.organization_id
        AND access.membership_id = shift.membership_id
        AND access.location_id = shift.location_id
       WHERE shift.id = ANY($3::uuid[])
         AND shift.status = 'ACTIVE' AND location.status = 'ACTIVE'`,
      [...pairs, shiftsResult.rows.map((shift) => shift.shift_id)],
    );
    for (const row of result.rows) projectable.set(row.shift_id, row);
  }
  const locations = new Map<string, LocationRow[]>();
  for (const row of locationsResult.rows) {
    const list = locations.get(row.membership_id) ?? [];
    list.push(row);
    locations.set(row.membership_id, list);
  }
  return {
    locations,
    shifts: new Map(shiftsResult.rows.map((row) => [row.membership_id, row])),
    projectable,
  };
}
