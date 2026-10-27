import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
  StaffOperationalMembershipContext,
  StaffOperationalRole,
  StaffOperationalShift,
} from "@valet/contracts";

import { loadOperationalMembershipDetails } from "./staff-operational-context-details";

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

    const details = await loadOperationalMembershipDetails(
      pool,
      membershipsResult.rows,
    );
    const contexts: StaffOperationalMembershipContext[] = [];

    for (const membership of membershipsResult.rows) {
      const rawShift = details.shifts.get(membership.membership_id);
      let activeShift: StaffOperationalShift | null = null;
      let currentLocation: StaffOperationalLocation | null = null;

      if (rawShift !== undefined) {
        // Step B: validate projection eligibility for the detected shift
        const projectable = details.projectable.get(rawShift.shift_id);
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
        eligibleLocations: (
          details.locations.get(membership.membership_id) ?? []
        ).map((loc) => ({
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
