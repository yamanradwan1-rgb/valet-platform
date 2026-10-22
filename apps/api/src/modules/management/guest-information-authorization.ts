import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
} from "./management-authorization";
import { hasManagementCommercialAccess } from "./management-commercial-access-policy";

export interface GuestInformationActor {
  readonly membershipId: string;
  readonly organizationId: string;
}

export interface GuestInformationScope extends GuestInformationActor {
  readonly kind: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly activeLocationIds: readonly string[] | null;
}

export async function authorizeGuestInformationCompany(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  mutation: boolean,
): Promise<GuestInformationActor> {
  await lockManagementSettingsOrganization(transaction, organizationId,
    mutation ? "EXCLUSIVE" : "SHARED");
  return authorizeCompanyAdminManagement(transaction, context, {
    assurance: mutation ? "SENSITIVE" : "STANDARD",
    capability: "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
    organizationId,
  });
}

async function authorizeScopedActor(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  mutation: boolean,
  locationId?: string,
): Promise<GuestInformationScope> {
  await lockManagementSettingsOrganization(transaction, organizationId,
    mutation ? "EXCLUSIVE" : "SHARED");
  // Current token, MFA age and user revocation must be protected by the
  // existing auth-session lock before the exact membership/grant check.
  await requireMfaAssuranceInTransaction(transaction, context, { sensitive: mutation });
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
    [organizationId]);
  const member = await transaction.query<{
    readonly membershipId: string;
    readonly role: string;
  }>(
    `SELECT membership.id::text AS "membershipId",membership.role::text AS role
     FROM organization_memberships AS membership
     JOIN organizations AS organization
       ON organization.id=membership.organization_id AND organization.status='ACTIVE'
     JOIN users AS user_account
       ON user_account.id=membership.user_id AND user_account.status='ACTIVE'
     WHERE membership.user_id=$1 AND membership.organization_id=$2
       AND membership.status='ACTIVE'
       AND membership.role IN ('ORG_ADMIN','LOCATION_MANAGER')
     FOR UPDATE OF membership`,
    [context.userId, organizationId]);
  const actor = member.rows[0];
  if (member.rowCount !== 1 || !actor) throw new ManagementAccessDeniedError();
  if (actor.role === "ORG_ADMIN") {
    const company = await authorizeCompanyAdminManagement(transaction, context, {
      assurance: mutation ? "SENSITIVE" : "STANDARD",
      capability: "LOCATION_SETTINGS_MANAGE_ELIGIBLE",
      organizationId,
      ...(locationId ? { targetLocationId: locationId, requireActiveLocation: true } : {}),
    });
    return {
      kind: "COMPANY_ADMIN", activeLocationIds: null,
      membershipId: company.membershipId, organizationId,
    };
  }
  if (!(await hasManagementCommercialAccess(transaction, organizationId, "DASHBOARD_ACCESS"))) {
    throw new ManagementAccessDeniedError();
  }
  // Lock each current ACTIVE grant; staff grant revocation takes the same
  // organization serialization lock and cannot pass the use interval.
  const grants = await transaction.query<{ readonly locationId: string }>(
    `SELECT location.id::text AS "locationId"
     FROM membership_location_access AS access
     JOIN locations AS location ON location.id=access.location_id
       AND location.organization_id=access.organization_id
       AND location.status='ACTIVE'
     WHERE access.organization_id=$1 AND access.membership_id=$2
     ORDER BY location.id FOR SHARE OF access,location`,
    [organizationId, actor.membershipId]);
  const allowed = grants.rows.map((row) => row.locationId);
  if (allowed.length === 0 || (locationId !== undefined && !allowed.includes(locationId))) {
    throw new ManagementAccessDeniedError();
  }
  return {
    kind: "LOCATION_MANAGER", activeLocationIds: allowed,
    membershipId: actor.membershipId, organizationId,
  };
}

export async function authorizeGuestInformationOverview(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
): Promise<GuestInformationScope> {
  return authorizeScopedActor(transaction, context, organizationId, false);
}

export async function authorizeGuestInformationLocation(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
  mutation: boolean,
): Promise<GuestInformationActor> {
  return authorizeScopedActor(transaction, context, organizationId, mutation, locationId);
}
