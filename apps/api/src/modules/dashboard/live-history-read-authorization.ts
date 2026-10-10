import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { LockedStaffSessionContext } from "../auth/staff-session-revalidation";
import { evaluateMfaAssurance } from "../auth/mfa/mfa-assurance-policy";
import { localMfaBypassEnabled } from "../auth/mfa/local-mfa-bypass";
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

type LiveHistoryViewerRole = "ORG_ADMIN" | "LOCATION_MANAGER";

interface ViewerRoleHint {
  readonly organizationId: string;
  readonly role: LiveHistoryViewerRole;
}

/**
 * Live-history reads are immutable. A SHARED user boundary and SHARED
 * session-row lock still block all existing EXCLUSIVE security writers
 * (refresh, logout, deactivation, factor updates), but do not serialize
 * simultaneous reads of the same Staff session.
 * The generic auth helper remains exclusive for mutation callers.
 */
async function lockLiveStaffSessionForRead(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedStaffSessionContext | undefined> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock_shared(
       hashtextextended('staff-user-security:' || $1::text, 0)
     )`,
    [context.userId],
  );
  const result = await transaction.query<LockedStaffSessionContext>(
    `SELECT session.id, session.user_id, session.created_at
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.created_at = $4::timestamptz
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR SHARE OF session`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  return result.rows[0];
}

interface LiveMfaSessionRow {
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly last_admin_activity_at: Date | null;
  readonly now: Date;
}

/**
 * Read-only CA assurance. Uses shared row locks to keep MFA state current
 * until COMMIT without forcing concurrent authorized CA reads to serialize.
 * All native MFA writers first acquire FOR UPDATE OF session, staff_user,
 * so they remain fenced until the historical read releases its lock.
 * The factor itself is SHARE-locked as defense against direct factor updates.
 */
async function requireLiveHistoryMfaForRead(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  const checked = await transaction.query<LiveMfaSessionRow>(
    `SELECT session.mfa_authenticated_at, session.mfa_factor_id,
            session.last_admin_activity_at, clock_timestamp() AS now
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1 AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR SHARE OF session, staff_user`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash],
  );
  const row = checked.rows[0];
  if (checked.rowCount !== 1 || row === undefined) {
    throw new UnauthorizedException();
  }
  if (localMfaBypassEnabled()) return;
  const factorCurrent =
    row.mfa_factor_id !== null &&
    (await transaction.query(
      `SELECT factor.id FROM user_mfa_totp_factors AS factor
       WHERE factor.id = $1 AND factor.user_id = $2
         AND factor.state = 'ACTIVE'
       FOR SHARE OF factor`,
      [row.mfa_factor_id, context.userId],
    )).rowCount === 1;
  if (evaluateMfaAssurance(
    {
      factorCurrent,
      lastAdminActivityAt: row.last_admin_activity_at,
      mfaAuthenticatedAt: row.mfa_authenticated_at,
      mfaFactorId: row.mfa_factor_id,
    },
    row.now,
    false,
  ) !== "ASSURANCE_VALID") {
    throw new MfaStepUpRequiredError();
  }
}

type LockedAuthorityRow = DashboardLocationScope;

async function liveHistoryViewerRoleHint(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  targetLocationId: string,
): Promise<ViewerRoleHint | null> {
  const result = await transaction.query<ViewerRoleHint>(
    `SELECT location.organization_id::text AS "organizationId",
            membership.role::text AS role
     FROM locations AS location
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = location.organization_id
      AND membership.user_id = $1
      AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
     WHERE location.id = $2`,
    [authenticatedUserId, targetLocationId],
  );
  if (result.rowCount !== 1) return null;
  return result.rows[0] ?? null;
}

async function lockLiveHistoryAuthority(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly organizationId: string;
    readonly role: LiveHistoryViewerRole;
    readonly staffSessionContext: StaffSessionContext;
    readonly targetLocationId: string;
  },
): Promise<DashboardLocationScope | null> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock_shared(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [input.organizationId],
  );

  // DEC-102: hold the entitlement row SHARE lock through history projection.
  // Runtime has SELECT but intentionally lacks UPDATE, which row locks need.
  // The existing granted SECURITY DEFINER helper acquires this lock after
  // proving the exact current Staff session, without expanding DB grants.
  const entitlement = await transaction.query<{ enabled: boolean }>(
    "SELECT shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled",
    [
      input.authenticatedUserId,
      input.staffSessionContext.staffAuthSessionId,
      input.staffSessionContext.accessTokenHash,
      input.organizationId,
    ],
  );
  if (entitlement.rows[0]?.enabled !== true) return null;

  const locationGrantJoin =
    input.role === "LOCATION_MANAGER"
      ? `INNER JOIN membership_location_access AS access
           ON access.organization_id = organization.id
          AND access.membership_id = membership.id
          AND access.location_id = location.id`
      : "";
  const locationGrantLock = input.role === "LOCATION_MANAGER" ? ", access" : "";

  const result = await transaction.query<LockedAuthorityRow>(
    `SELECT organization.id::text AS "organizationId",
            location.id::text AS "locationId",
            membership.id::text AS "membershipId"
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $3
      AND location.status = 'ACTIVE'
     ${locationGrantJoin}
     INNER JOIN organization_subscriptions AS subscription
       ON subscription.organization_id = organization.id
      AND subscription.dashboard_access_enabled = TRUE
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role = $4::membership_role
     FOR SHARE OF membership
     FOR SHARE OF organization, location${locationGrantLock}`,
    [
      input.authenticatedUserId,
      input.organizationId,
      input.targetLocationId,
      input.role,
    ],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) return null;
  return row;
}

/**
 * DEC-102 Live-only authorization.
 *
 * Lock order is intentionally local to the purpose-specific history read:
 * staff-user-security SHARED -> exact Staff session SHARED -> CA MFA (CA only) ->
 * staff-management-org -> entitlement SECURITY DEFINER row SHARE ->
 * actor membership + exact Location/grant + Organization rows. Locks are held
 * by the caller through the bounded historical projection.
 */
export async function authorizeLiveHistoryLocation(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly staffSessionContext: StaffSessionContext;
    readonly targetLocationId: string;
  },
): Promise<DashboardLocationScope | null> {
  if (input.staffSessionContext.userId !== input.authenticatedUserId)
    return null;
  if (
    (await lockLiveStaffSessionForRead(
      transaction,
      input.staffSessionContext,
    )) === undefined
  ) {
    return null;
  }

  // This read selects only the branch to validate. It grants no authority:
  // the role, Organization and Location are all rechecked under locks below.
  const hint = await liveHistoryViewerRoleHint(
    transaction,
    input.authenticatedUserId,
    input.targetLocationId,
  );
  if (hint === null) return null;

  let mfaFailure: MfaStepUpRequiredError | UnauthorizedException | null = null;
  if (hint.role === "ORG_ADMIN") {
    // The exact session is already held FOR SHARE. Current MFA mutation
    // paths require an incompatible session FOR UPDATE before mfa-user/factor
    // mutations, so they cannot cross this historical read's assurance check.
    try {
      await requireLiveHistoryMfaForRead(
        transaction,
        input.staffSessionContext,
      );
    } catch (error) {
      if (
        !(error instanceof MfaStepUpRequiredError) &&
        !(error instanceof UnauthorizedException)
      ) {
        throw error;
      }
      // The role hint is explicitly non-authoritative. Do not let a stale
      // ORG_ADMIN hint turn a denied Location into a distinguishable MFA/401
      // response before current Organization, membership, Location, grant and
      // entitlement are rechecked under their transaction locks.
      mfaFailure = error;
    }
  }

  const scope = await lockLiveHistoryAuthority(transaction, {
    authenticatedUserId: input.authenticatedUserId,
    organizationId: hint.organizationId,
    role: hint.role,
    staffSessionContext: input.staffSessionContext,
    targetLocationId: input.targetLocationId,
  });
  if (scope === null) return null;
  if (mfaFailure !== null) throw mfaFailure;
  return scope;
}
