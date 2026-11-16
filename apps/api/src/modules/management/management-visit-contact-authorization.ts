import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockStaffSessionWithBearer } from "../auth/staff-session-lock";
import { hasManagementCommercialAccess } from "./management-commercial-access-policy";
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
  if (
    (await lockStaffSessionWithBearer(transaction, context, "EXCLUSIVE")) ===
    undefined
  ) {
    return null;
  }
  const result = await transaction.query<RoleRow>(
    `SELECT membership.role::text AS role
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'`,
    [context.userId, organizationId],
  );
  return result.rows[0]?.role ?? null;
}

async function authorizeLocationManager(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<VisitContactViewer> {
  if (
    (await lockStaffSessionWithBearer(transaction, context, "SHARED")) ===
    undefined
  ) {
    return deny();
  }
  const result = await transaction.query<LocationManagerRow>(
    `SELECT membership.id::text AS "membershipId",
            organization.id::text AS "organizationId",
            array_agg(access.location_id::text ORDER BY access.location_id)::text[] AS "locationIds"
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN membership_location_access AS access
       ON access.organization_id = organization.id
      AND access.membership_id = membership.id
     INNER JOIN locations AS location
       ON location.id = access.location_id
      AND location.organization_id = organization.id
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
      AND membership.status = 'ACTIVE'
      AND membership.role = 'LOCATION_MANAGER'
     GROUP BY membership.id, organization.id`,
    [context.userId, organizationId],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row === undefined ||
    row.locationIds.length === 0
  ) {
    return deny();
  }
  if (
    !(await hasManagementCommercialAccess(
      transaction,
      row.organizationId,
      "DASHBOARD_ACCESS",
    ))
  ) {
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
