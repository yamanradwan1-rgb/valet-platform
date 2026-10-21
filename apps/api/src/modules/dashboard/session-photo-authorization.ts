import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { DashboardLocationScope } from "./dashboard-location-authorization";
import { authorizeLiveHistoryLocation } from "./live-history-read-authorization";

type AcceptedPhotoViewerRole = "ORG_ADMIN" | "LOCATION_MANAGER";

export interface DashboardSessionPhotoViewInput {
  readonly authenticatedUserId: string;
  readonly staffSessionContext: StaffSessionContext;
  readonly targetLocationId: string;
  readonly targetSessionId: string;
}

/**
 * Injectable policy retained for focused authorization tests. Runtime callers
 * use the fixed owner-approved Company Admin/Location Manager role matrix.
 */
export interface SessionPhotoViewTestPolicy {
  readonly proposedRoles: readonly AcceptedPhotoViewerRole[];
}

/**
 * Owner-approved #309 VIEW roles. CA MFA and LM's explicit current Location
 * grant remain mandatory through the Live History authorization fence.
 */
export const ACCEPTED_SESSION_PHOTO_VIEW_TEST_POLICY: SessionPhotoViewTestPolicy =
  Object.freeze({
    proposedRoles: Object.freeze(["ORG_ADMIN", "LOCATION_MANAGER"] as const),
  });

/**
 * Normal #309 VIEW entry. Existing Dashboard/Live History/Check-In navigation
 * alone grants no photo authority; the policy below rechecks the exact active
 * Staff session, entitlement, MFA, membership, Location and ValetSession.
 */
export async function authorizeManagementSessionPhotoView(
  transaction: PostgresTransaction,
  input: DashboardSessionPhotoViewInput,
): Promise<DashboardLocationScope | null> {
  return authorizeSessionPhotoViewWithTestPolicy(
    transaction,
    input,
    ACCEPTED_SESSION_PHOTO_VIEW_TEST_POLICY,
  );
}

/**
 * @internal Injectable authorization seam retained for focused tests. The
 * runtime entry above selects only the fixed approved role matrix. The
 * Staff session, MFA, subscription, Organization/Location/membership/grant
 * revocation fences are enforced within the caller's transaction.
 */
export async function authorizeSessionPhotoViewWithTestPolicy(
  transaction: PostgresTransaction,
  input: DashboardSessionPhotoViewInput,
  policy: SessionPhotoViewTestPolicy,
): Promise<DashboardLocationScope | null> {
  // An empty policy is a deliberate short circuit: even a valid Dashboard
  // session must not issue queries that could be mistaken for photo authority.
  if (policy.proposedRoles.length === 0) return null;
  if (
    !input.authenticatedUserId ||
    !input.targetLocationId ||
    !input.targetSessionId ||
    input.staffSessionContext.userId !== input.authenticatedUserId
  ) return null;

  // #315's READ COMMITTED fence is essential for the second grant check.
  // RR/SERIALIZABLE can preserve an old MVCC snapshot after the writer
  // finishes and must never authorize this more-sensitive read.
  const isolation = await transaction.query<{ readonly readCommitted: boolean }>(
    `SELECT current_setting('transaction_isolation') = 'read committed'
       AS "readCommitted"`,
  );
  if (isolation.rows[0]?.readCommitted !== true) return null;

  // READ ONLY prerequisite, NOT photo-view permission. Maintains shared
  // user/session locks, CA MFA, org advisory, dashboard entitlement,
  // membership/role and Location/grant locks through caller's transaction.
  const scope = await authorizeLiveHistoryLocation(transaction, {
    authenticatedUserId: input.authenticatedUserId,
    staffSessionContext: input.staffSessionContext,
    targetLocationId: input.targetLocationId,
  });
  if (
    scope === null ||
    scope.locationId !== input.targetLocationId
  ) return null;

  // Re-check the actual locked membership role rather than trusting a
  // request-supplied role or a stale management/UI navigation capability.
  const membership = await transaction.query<{
    readonly role: AcceptedPhotoViewerRole;
  }>(
    `SELECT membership.role::text AS role
     FROM organization_memberships AS membership
     WHERE membership.id = $1
       AND membership.user_id = $2
       AND membership.organization_id = $3
       AND membership.status = 'ACTIVE'
       AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
     FOR SHARE OF membership`,
    [scope.membershipId, input.authenticatedUserId, scope.organizationId],
  );
  const role = membership.rows[0]?.role;
  if (
    membership.rowCount !== 1 ||
    (role !== "ORG_ADMIN" && role !== "LOCATION_MANAGER") ||
    !policy.proposedRoles.includes(role)
  ) return null;

  // Vehicle ID alone is not a photo-view boundary. Check the persisted
  // exact ValetSession's Organization + Location + id in the same transaction.
  const session = await transaction.query<{ readonly sessionId: string }>(
    `SELECT session.id::text AS "sessionId"
     FROM valet_sessions AS session
     WHERE session.id = $1
       AND session.organization_id = $2
       AND session.location_id = $3
     FOR SHARE OF session`,
    [input.targetSessionId, scope.organizationId, scope.locationId],
  );
  if (
    session.rowCount !== 1 ||
    session.rows[0]?.sessionId !== input.targetSessionId
  ) return null;
  return scope;
}
