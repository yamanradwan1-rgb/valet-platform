import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { lockAndRecheckMfaSession } from "../auth/mfa/mfa-session-repository";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { ManagementAccessDeniedError } from "./management-authorization";
import { PresenceManagementBusyError } from "./presence-management-diagnostics";

export interface PresenceManagementTarget {
  readonly authority: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly organizationId?: string;
  readonly locationId?: string;
}

export interface PresenceManagementActor {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly userId: string;
}

/** Owns the complete caller transaction's authority check-use interval (UI-F). */
export async function protectPresenceManagementAuthority(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  target: PresenceManagementTarget,
  options: {
    readonly mutation: boolean;
    readonly configurationWriter: boolean;
  },
): Promise<PresenceManagementActor> {
  let organizationId = target.organizationId;
  if (target.locationId !== undefined) {
    const location = await transaction.query<{ organization_id: string }>(
      `SELECT organization_id::text FROM locations WHERE id=$1`,
      [target.locationId],
    );
    const persistedOrganizationId = location.rows[0]?.organization_id;
    if (
      persistedOrganizationId === undefined ||
      (organizationId !== undefined &&
        organizationId !== persistedOrganizationId)
    ) {
      throw new ManagementAccessDeniedError();
    }
    organizationId = persistedOrganizationId;
  }
  if (organizationId === undefined) throw new ManagementAccessDeniedError();
  await lockManagementSettingsOrganization(
    transaction,
    organizationId,
    options.configurationWriter ? "EXCLUSIVE" : "SHARED",
  );
  if (target.locationId !== undefined) {
    await lockLocationLifecycle(transaction, target.locationId, "SHARED");
  } else if (options.configurationWriter) {
    const locations = await transaction.query<{ id: string }>(
      `SELECT id::text FROM locations WHERE organization_id=$1 ORDER BY id`,
      [organizationId],
    );
    for (const location of locations.rows)
      await lockLocationLifecycle(transaction, location.id, "SHARED");
  }
  if (
    (await lockAndRecheckStaffSessionContext(transaction, context)) ===
    undefined
  )
    throw new UnauthorizedException();
  const session = await lockAndRecheckMfaSession(transaction, context);
  const boundary = await transaction.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended('staff-management-org:'||$1::text,0)) AS acquired`,
    [organizationId],
  );
  if (boundary.rows[0]?.acquired !== true)
    throw new PresenceManagementBusyError("ADVISORY_TRY_LOCK_BUSY");
  const member = await transaction.query<{
    id: string;
    role: string;
    status: string;
  }>(
    `SELECT id::text,role::text,status::text FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
    [organizationId, context.userId],
  );
  const actor = member.rows[0];
  const expectedRole =
    target.authority === "COMPANY_ADMIN" ? "ORG_ADMIN" : "LOCATION_MANAGER";
  if (actor?.status !== "ACTIVE" || actor.role !== expectedRole)
    throw new ManagementAccessDeniedError();
  const organization = await transaction.query<{ status: string }>(
    `SELECT status::text FROM organizations WHERE id=$1 FOR SHARE`,
    [organizationId],
  );
  const subscription = await transaction.query<{ enabled: boolean }>(
    `SELECT shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled`,
    [
      context.userId,
      context.staffAuthSessionId,
      context.accessTokenHash,
      organizationId,
    ],
  );
  if (
    organization.rows[0]?.status !== "ACTIVE" ||
    subscription.rows[0]?.enabled !== true
  )
    throw new ManagementAccessDeniedError();
  if (target.locationId !== undefined) {
    const location = await transaction.query<{ status: string }>(
      `SELECT status::text FROM locations WHERE organization_id=$1 AND id=$2 FOR SHARE`,
      [organizationId, target.locationId],
    );
    if (location.rows[0] === undefined) throw new ManagementAccessDeniedError();
    if (target.authority === "LOCATION_MANAGER") {
      const access = await transaction.query(
        `SELECT location_id FROM membership_location_access
        WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3 FOR SHARE`,
        [organizationId, actor.id, target.locationId],
      );
      if (location.rows[0].status !== "ACTIVE" || access.rowCount !== 1)
        throw new ManagementAccessDeniedError();
    }
  } else if (target.authority !== "COMPANY_ADMIN")
    throw new ManagementAccessDeniedError();
  if (session.mfa_factor_id !== null) {
    await transaction.query(
      `SELECT id FROM user_mfa_totp_factors WHERE id=$1 AND user_id=$2 FOR SHARE`,
      [session.mfa_factor_id, context.userId],
    );
  }
  if (options.mutation || target.authority === "COMPANY_ADMIN") {
    await requireMfaAssuranceInTransaction(transaction, context, {
      sensitive: options.mutation,
    });
  }
  return {
    membershipId: actor.id,
    organizationId,
    locationId: target.locationId ?? null,
    userId: context.userId,
  };
}
