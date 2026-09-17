import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { isCompanyAdminManagementCapability } from "./management-capabilities";
import { ManagementAccessDeniedError } from "./management-authorization";

export type ManagementAuditViewerRole =
  "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR";

export interface ManagementAuditAuthorization {
  readonly locationId: string | null;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: ManagementAuditViewerRole;
  readonly scope: "LOCATION" | "ORGANIZATION";
}

interface AuthorizationRow {
  readonly membershipId: string;
  readonly organizationId: string;
}

interface RoleHintRow {
  readonly role: string;
}

function deny(): never {
  throw new ManagementAccessDeniedError();
}

async function requireCurrentAuditMfa(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  if (!isCompanyAdminManagementCapability("TENANT_AUDIT_READ_ELIGIBLE")) deny();
  await requireMfaAssuranceInTransaction(transaction, context, {
    sensitive: false,
  });
}

async function organizationRoleHint(
  transaction: PostgresTransaction,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const result = await transaction.query<RoleHintRow>(
    `SELECT membership.role::text AS role
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'`,
    [userId, organizationId],
  );
  return result.rows[0]?.role ?? null;
}

async function locationRoleHint(
  transaction: PostgresTransaction,
  userId: string,
  organizationId: string,
  locationId: string,
): Promise<string | null> {
  const result = await transaction.query<RoleHintRow>(
    `SELECT membership.role::text AS role
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $3
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'`,
    [userId, organizationId, locationId],
  );
  return result.rows[0]?.role ?? null;
}

async function authorizeAdminScope(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId?: string,
): Promise<ManagementAuditAuthorization> {
  await requireCurrentAuditMfa(transaction, context);
  const parameters = [context.userId, organizationId];
  const locationJoin =
    locationId === undefined
      ? ""
      : `INNER JOIN locations AS location
           ON location.organization_id = organization.id
          AND location.id = $3`;
  const lockedRelations =
    locationId === undefined
      ? "membership, organization"
      : "membership, organization, location";
  if (locationId !== undefined) parameters.push(locationId);
  const result = await transaction.query<AuthorizationRow>(
    `SELECT membership.id::text AS "membershipId",
            organization.id::text AS "organizationId"
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     ${locationJoin}
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role = 'ORG_ADMIN'
     FOR SHARE OF ${lockedRelations}`,
    parameters,
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) deny();
  return {
    locationId: locationId ?? null,
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    role: "ORG_ADMIN",
    scope: locationId === undefined ? "ORGANIZATION" : "LOCATION",
  };
}

async function authorizeGrantedLocation(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
  role: "LOCATION_MANAGER" | "VALET_SUPERVISOR",
): Promise<ManagementAuditAuthorization> {
  const supervisorJoin =
    role === "VALET_SUPERVISOR"
      ? `INNER JOIN shifts AS shift_row
           ON shift_row.organization_id = organization.id
          AND shift_row.location_id = location.id
          AND shift_row.membership_id = membership.id
          AND shift_row.status = 'ACTIVE'`
      : "";
  const locationStatus =
    role === "VALET_SUPERVISOR" ? "AND location.status = 'ACTIVE'" : "";
  const lockedRelations =
    role === "VALET_SUPERVISOR"
      ? "session, actor, membership, organization, location, access_row, shift_row"
      : "session, actor, membership, organization, location, access_row";
  const result = await transaction.query<AuthorizationRow>(
    `SELECT membership.id::text AS "membershipId",
            organization.id::text AS "organizationId"
     FROM staff_auth_sessions AS session
     INNER JOIN users AS actor
       ON actor.id = session.user_id
      AND actor.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.user_id = actor.id
      AND membership.organization_id = $4
      AND membership.status = 'ACTIVE'
      AND membership.role = $5::membership_role
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $6
      ${locationStatus}
     INNER JOIN membership_location_access AS access_row
       ON access_row.organization_id = organization.id
      AND access_row.membership_id = membership.id
      AND access_row.location_id = location.id
     ${supervisorJoin}
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
     FOR SHARE OF ${lockedRelations}`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      organizationId,
      role,
      locationId,
    ],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) deny();
  return {
    locationId,
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    role,
    scope: "LOCATION",
  };
}

export async function authorizeManagementAuditOrganization(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<ManagementAuditAuthorization> {
  const role = await organizationRoleHint(
    transaction,
    context.userId,
    organizationId,
  );
  if (role !== "ORG_ADMIN") deny();
  return authorizeAdminScope(transaction, context, organizationId);
}

export async function authorizeManagementAuditLocation(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
): Promise<ManagementAuditAuthorization> {
  const role = await locationRoleHint(
    transaction,
    context.userId,
    organizationId,
    locationId,
  );
  if (role === "ORG_ADMIN") {
    return authorizeAdminScope(
      transaction,
      context,
      organizationId,
      locationId,
    );
  }
  if (role === "LOCATION_MANAGER" || role === "VALET_SUPERVISOR") {
    return authorizeGrantedLocation(
      transaction,
      context,
      organizationId,
      locationId,
      role,
    );
  }
  return deny();
}
