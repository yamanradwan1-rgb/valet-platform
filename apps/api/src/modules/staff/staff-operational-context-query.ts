import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
  StaffOperationalMembershipContext,
  StaffOperationalRole,
  StaffOperationalShift,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";

export class StaffOperationalContextError extends Error {
  readonly code: "AUTHORIZATION_DENIED";

  constructor(code: "AUTHORIZATION_DENIED") {
    super("Resource not found or access denied.");
    this.name = "StaffOperationalContextError";
    this.code = code;
  }
}

interface MembershipRow {
  readonly membership_id: string;
  readonly organization_id: string;
  readonly organization_name: string;
  readonly role: string;
}

interface LocationRow {
  readonly code: string;
  readonly currency: string;
  readonly location_id: string;
  readonly name: string;
  readonly timezone: string;
}

interface RawActiveShiftRow {
  readonly location_id: string;
  readonly shift_id: string;
  readonly started_at: Date;
}

interface ProjectableShiftRow {
  readonly currency: string;
  readonly code: string;
  readonly location_id: string;
  readonly name: string;
  readonly shift_id: string;
  readonly started_at: Date;
  readonly timezone: string;
}

export function createStaffOperationalContextQuery(pool: PostgresPool) {
  return async (
    authenticatedUserId: string,
  ): Promise<StaffOperationalContextResponse> => {
    const userResult = await pool.query<{ status: string }>(
      `SELECT status::text
       FROM users
       WHERE id = $1`,
      [authenticatedUserId],
    );

    if (userResult.rows[0]?.status !== "ACTIVE") {
      throw new StaffOperationalContextError("AUTHORIZATION_DENIED");
    }

    const membershipsResult = await pool.query<MembershipRow>(
      `SELECT membership.id::text AS membership_id,
              membership.role::text AS role,
              organization.id::text AS organization_id,
              organization.name AS organization_name
       FROM organization_memberships AS membership
       INNER JOIN organizations AS organization
         ON organization.id = membership.organization_id
       WHERE membership.user_id = $1
         AND membership.status = 'ACTIVE'
         AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
         AND organization.status = 'ACTIVE'
       ORDER BY organization.id, membership.id`,
      [authenticatedUserId],
    );

    if (membershipsResult.rows.length === 0) {
      throw new StaffOperationalContextError("AUTHORIZATION_DENIED");
    }

    const contexts: StaffOperationalMembershipContext[] = [];

    for (const membership of membershipsResult.rows) {
      const locationsResult = await pool.query<LocationRow>(
        `SELECT location.id::text AS location_id,
                location.name,
                location.code,
                location.currency,
                location.timezone
         FROM membership_location_access AS access
         INNER JOIN locations AS location
           ON location.id = access.location_id
          AND location.organization_id = access.organization_id
         WHERE access.organization_id = $1
           AND access.membership_id = $2
           AND location.status = 'ACTIVE'
         ORDER BY location.id`,
        [membership.organization_id, membership.membership_id],
      );

      // Step A: detect persisted ACTIVE shift existence (unconditional)
      const rawShiftResult = await pool.query<RawActiveShiftRow>(
        `SELECT shift.id::text AS shift_id,
                shift.location_id::text AS location_id,
                shift.started_at
         FROM shifts AS shift
         WHERE shift.organization_id = $1
           AND shift.membership_id = $2
           AND shift.status = 'ACTIVE'`,
        [membership.organization_id, membership.membership_id],
      );

      const rawShift = rawShiftResult.rows[0];
      let activeShift: StaffOperationalShift | null = null;
      let currentLocation: StaffOperationalLocation | null = null;

      if (rawShift !== undefined) {
        // Step B: validate projection eligibility for the detected shift
        const projectableResult = await pool.query<ProjectableShiftRow>(
          `SELECT shift.id::text AS shift_id,
                  shift.location_id::text AS location_id,
                  shift.started_at,
                  location.name,
                  location.code,
                  location.currency,
                  location.timezone
           FROM shifts AS shift
           INNER JOIN locations AS location
             ON location.id = shift.location_id
            AND location.organization_id = shift.organization_id
           INNER JOIN membership_location_access AS access
             ON access.organization_id = shift.organization_id
            AND access.membership_id = shift.membership_id
            AND access.location_id = shift.location_id
           WHERE shift.id = $1
             AND shift.organization_id = $2
             AND shift.membership_id = $3
             AND shift.status = 'ACTIVE'
             AND location.status = 'ACTIVE'`,
          [
            rawShift.shift_id,
            membership.organization_id,
            membership.membership_id,
          ],
        );

        const projectable = projectableResult.rows[0];
        if (projectable === undefined) {
          // ACTIVE shift exists but fails projection eligibility.
          // Fail closed: do not misrepresent as activeShift=null.
          throw new StaffOperationalContextError("AUTHORIZATION_DENIED");
        }

        activeShift = {
          locationId: projectable.location_id,
          shiftId: projectable.shift_id,
          startedAt: projectable.started_at.toISOString(),
          status: "ACTIVE",
        };
        currentLocation = {
          code: projectable.code,
          currency: projectable.currency,
          locationId: projectable.location_id,
          name: projectable.name,
          timezone: projectable.timezone,
        };
      }

      contexts.push({
        activeShift,
        currentLocation,
        eligibleLocations: locationsResult.rows.map((loc) => ({
          code: loc.code,
          currency: loc.currency,
          locationId: loc.location_id,
          name: loc.name,
          timezone: loc.timezone,
        })),
        membershipId: membership.membership_id,
        organization: {
          name: membership.organization_name,
          organizationId: membership.organization_id,
        },
        role: membership.role as StaffOperationalRole,
      });
    }

    return { contexts };
  };
}
