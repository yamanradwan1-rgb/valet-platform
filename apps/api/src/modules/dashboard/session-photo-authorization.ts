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
 * The owner accepted the Company Admin/Location Manager role matrix for
 * #309, subject to independent security, IAM and rollout acceptance.
 * This policy injection exists solely for isolated tests of that decision.
 *
 * NEVER import the injected-policy helper from an HTTP handler or worker.
 * The public production entry below has no injection argument and always
 * denies until the independent IAM/rollout gate is explicitly accepted.
 */
export interface SessionPhotoViewTestPolicy {
  readonly proposedRoles: readonly AcceptedPhotoViewerRole[];
}

/**
 * Test-only role matrix accepted by the owner in Issue #309 comment
 * 6324638519. It does not activate VIEW through the production entry point.
 * Company Admin still requires current MFA; Location Manager still requires
 * the active, explicit Location grant checked by Live History authorization.
 */
export const ACCEPTED_SESSION_PHOTO_VIEW_TEST_POLICY: SessionPhotoViewTestPolicy =
  Object.freeze({
    proposedRoles: Object.freeze(["ORG_ADMIN", "LOCATION_MANAGER"] as const),
  });

const DENY_UNAPPROVED_PHOTO_VIEW: SessionPhotoViewTestPolicy = Object.freeze({
  proposedRoles: Object.freeze([]),
});

/**
 * #309 owner decision gate: existing Dashboard, Live History, Management
 * Audit and employee Check-In permissions NEVER imply photo byte VIEW.
 *
 * The accepted role matrix has NOT passed the independent IAM/release gate;
 * a future approved rollout must independently change this production gate.
 */
export async function authorizeManagementSessionPhotoView(
  transaction: PostgresTransaction,
  input: DashboardSessionPhotoViewInput,
): Promise<DashboardLocationScope | null> {
  return authorizeSessionPhotoViewWithTestPolicy(
    transaction,
    input,
    DENY_UNAPPROVED_PHOTO_VIEW,
  );
}

/**
 * @internal TESTS ONLY. No default export, environment override or public
 * feature flag grants this capability in production.
 *
 * This exercises an owner-approved role in isolated tests while retaining
 * current Staff session, MFA, subscription, Organization/Location/membership
 * and grant revocation fences provided by the Live History read boundary.
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
