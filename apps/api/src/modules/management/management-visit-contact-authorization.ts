import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
} from "./management-authorization";

export interface VisitContactViewer {
  readonly locationIds: readonly string[] | null;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: "LOCATION_MANAGER" | "ORG_ADMIN";
}

interface RoleRow {
  readonly role: string;
}

interface LocationManagerRow {
  readonly locationIds: string[];
  readonly membershipId: string;
  readonly organizationId: string;
}

function deny(): never {
  throw new ManagementAccessDeniedError();
}

async function currentRole(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<string | null> {
  const result = await transaction.query<RoleRow>(
    `SELECT membership.role::text AS role
     FROM staff_auth_sessions AS session
     INNER JOIN users AS actor
       ON actor.id = session.user_id AND actor.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id
      AND membership.organization_id = $4
      AND membership.status = 'ACTIVE'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      organizationId,
    ],
  );
  return result.rows[0]?.role ?? null;
}

async function authorizeLocationManager(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<VisitContactViewer> {
  const result = await transaction.query<LocationManagerRow>(
    `SELECT membership.id::text AS "membershipId",
            organization.id::text AS "organizationId",
            array_agg(access.location_id::text ORDER BY access.location_id)::text[] AS "locationIds"
     FROM staff_auth_sessions AS session
     INNER JOIN users AS actor
       ON actor.id = session.user_id AND actor.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id
      AND membership.organization_id = $4
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
     INNER JOIN locations AS location
       ON location.id = access.location_id
      AND location.organization_id = organization.id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
     GROUP BY membership.id, organization.id`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      organizationId,
    ],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined || row.locationIds.length === 0) {
    return deny();
  }
  return { ...row, role: "LOCATION_MANAGER" };
}

export async function authorizeVisitContactRead(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<VisitContactViewer> {
  const role = await currentRole(transaction, context, organizationId);
  if (role === "ORG_ADMIN") {
    const actor = await authorizeCompanyAdminManagement(transaction, context, {
      assurance: "STANDARD",
      capability: "VISIT_CONTACT_READ_ELIGIBLE",
      organizationId,
    });
    return {
      locationIds: null,
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      role: "ORG_ADMIN",
    };
  }
  if (role === "LOCATION_MANAGER") {
    return authorizeLocationManager(transaction, context, organizationId);
  }
  return deny();
}

export async function authorizeVisitContactCorrection(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<VisitContactViewer> {
  const actor = await authorizeCompanyAdminManagement(transaction, context, {
    assurance: "SENSITIVE",
    capability: "VISIT_CONTACT_CORRECT_ELIGIBLE",
    organizationId,
  });
  return {
    locationIds: null,
    membershipId: actor.membershipId,
    organizationId: actor.organizationId,
    role: "ORG_ADMIN",
  };
}
