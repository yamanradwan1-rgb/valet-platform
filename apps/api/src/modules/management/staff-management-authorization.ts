import { createHash } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { hasManagementCommercialAccess } from "./management-commercial-access-policy";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
  type ManagementAssuranceRequirement,
} from "./management-authorization";

export interface StaffManagementAuthority {
  readonly activeLocationIds: readonly string[] | null;
  readonly kind: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly membershipId: string;
  readonly organizationId: string;
  readonly scopeFingerprint: string;
}

interface RoleRow {
  readonly role: string;
}

interface MembershipRow {
  readonly membershipId: string;
}

function deny(): never {
  throw new ManagementAccessDeniedError();
}

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
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
  assurance: ManagementAssuranceRequirement | undefined,
): Promise<StaffManagementAuthority> {
  if (assurance === "SENSITIVE") {
    await requireMfaAssuranceInTransaction(transaction, context, {
      sensitive: true,
    });
  }
  await transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [organizationId],
  );
  const actor = await transaction.query<MembershipRow>(
    `SELECT membership.id::text AS "membershipId"
     FROM organization_memberships AS membership
     INNER JOIN users AS staff_user
       ON staff_user.id = membership.user_id AND staff_user.status = 'ACTIVE'
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role = 'LOCATION_MANAGER'
     FOR UPDATE OF membership`,
    [context.userId, organizationId],
  );
  const membershipId = actor.rows[0]?.membershipId;
  if (actor.rowCount !== 1 || membershipId === undefined) return deny();
  if (
    !(await hasManagementCommercialAccess(
      transaction,
      organizationId,
      "DASHBOARD_ACCESS",
    ))
  ) {
    return deny();
  }
  const grants = await transaction.query<{ readonly locationId: string }>(
    `SELECT location.id::text AS "locationId"
     FROM membership_location_access AS access
     INNER JOIN locations AS location
       ON location.id = access.location_id
      AND location.organization_id = access.organization_id
      AND location.status = 'ACTIVE'
     WHERE access.organization_id = $1
       AND access.membership_id = $2
     ORDER BY location.id
     FOR SHARE OF location`,
    [organizationId, membershipId],
  );
  const activeLocationIds = grants.rows.map((row) => row.locationId);
  if (activeLocationIds.length === 0) return deny();
  return {
    activeLocationIds,
    kind: "LOCATION_MANAGER",
    membershipId,
    organizationId,
    scopeFingerprint: fingerprint([
      "LOCATION_MANAGER",
      membershipId,
      ...activeLocationIds,
    ]),
  };
}

export async function authorizeStaffManagement(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  input: {
    readonly assurance?: ManagementAssuranceRequirement;
    readonly organizationId: string;
  },
): Promise<StaffManagementAuthority> {
  const role = await currentRole(transaction, context, input.organizationId);
  if (role === "ORG_ADMIN") {
    const actor = await authorizeCompanyAdminManagement(transaction, context, {
      ...(input.assurance === undefined ? {} : { assurance: input.assurance }),
      capability: "STAFF_MANAGE_ELIGIBLE",
      organizationId: input.organizationId,
    });
    return {
      activeLocationIds: null,
      kind: "COMPANY_ADMIN",
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      scopeFingerprint: fingerprint(["COMPANY_ADMIN", actor.membershipId]),
    };
  }
  if (role === "LOCATION_MANAGER") {
    return authorizeLocationManager(
      transaction,
      context,
      input.organizationId,
      input.assurance,
    );
  }
  return deny();
}

export async function authorizeStaffTarget(
  transaction: PostgresTransaction,
  authority: StaffManagementAuthority,
  membershipId: string,
  lock = false,
): Promise<void> {
  if (authority.kind === "COMPANY_ADMIN") {
    const target = await transaction.query(
      `SELECT 1 FROM organization_memberships
       WHERE id = $1 AND organization_id = $2
         AND status IN ('ACTIVE', 'INACTIVE')`,
      [membershipId, authority.organizationId],
    );
    if (target.rowCount !== 1) return deny();
    return;
  }
  const result = await transaction.query(
    `SELECT 1
     FROM organization_memberships AS target
     WHERE target.id = $1
       AND target.organization_id = $2
       AND target.id <> $3
       AND target.status IN ('ACTIVE', 'INACTIVE')
       AND target.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND EXISTS (
         SELECT 1 FROM membership_location_access AS target_access
         WHERE target_access.organization_id = target.organization_id
           AND target_access.membership_id = target.id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM membership_location_access AS target_access
         WHERE target_access.organization_id = target.organization_id
           AND target_access.membership_id = target.id
           AND NOT EXISTS (
             SELECT 1
             FROM membership_location_access AS actor_access
             INNER JOIN locations AS location
               ON location.id = actor_access.location_id
              AND location.organization_id = actor_access.organization_id
              AND location.status = 'ACTIVE'
             WHERE actor_access.organization_id = target.organization_id
               AND actor_access.membership_id = $3
               AND actor_access.location_id = target_access.location_id
           )
       )
     ${lock ? "FOR UPDATE OF target" : ""}`,
    [membershipId, authority.organizationId, authority.membershipId],
  );
  if (result.rowCount !== 1) return deny();
}

export function requireAuthorizedLocationFilter(
  authority: StaffManagementAuthority,
  locationId: string | undefined,
): void {
  if (
    locationId !== undefined &&
    authority.kind === "LOCATION_MANAGER" &&
    !authority.activeLocationIds?.includes(locationId)
  ) {
    deny();
  }
}
