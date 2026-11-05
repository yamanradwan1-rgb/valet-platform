import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { evaluateMfaAssurance } from "../../auth/mfa/mfa-assurance-policy";
import { localMfaBypassEnabled } from "../../auth/mfa/local-mfa-bypass";
import { isCompanyAdminManagementCapability } from "../../management/management-capabilities";
import { ManagementAccessDeniedError } from "../../management/management-authorization";

export interface AdministrativeAlertOccurrence {
  readonly category: "ALT-13" | "ALT-15";
  readonly eventId: string;
  /** UUID of the Shift or staff membership, not an unrestricted detail grant. */
  readonly targetId: string;
  readonly sourceKind: "SHIFT" | "STAFF";
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly occurredAt: string;
  readonly severity: "IMPORTANT";
  readonly title: string;
}

export interface AdministrativeAlertQueryInput {
  readonly context: StaffSessionContext;
  readonly organizationId: string;
  readonly limit: number;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireAdministrativeAlertQuery(
  input: AdministrativeAlertQueryInput,
  eventId?: string,
): void {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 21) {
    throw new RangeError("Administrative alert source limit must be 1..21.");
  }
  if (
    !uuidPattern.test(input.organizationId) ||
    (eventId !== undefined && !uuidPattern.test(eventId))
  ) {
    throw new ManagementAccessDeniedError();
  }
}

interface ProtectedSessionRow {
  readonly factorCurrent: boolean;
  readonly lastAdminActivityAt: Date | null;
  readonly mfaAuthenticatedAt: Date | null;
  readonly mfaFactorId: string | null;
  readonly now: Date;
}

/** Share-lock Staff session and User before the SHARED Organization fence.
 * Read-only alert tabs never acquire a command-grade exclusive session lock.
 */
async function requireProtectedReadSession(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  const result = await transaction.query<ProtectedSessionRow>(
    `SELECT session.mfa_authenticated_at AS "mfaAuthenticatedAt",
            session.mfa_factor_id::text AS "mfaFactorId",
            session.last_admin_activity_at AS "lastAdminActivityAt",
            clock_timestamp() AS now,
            EXISTS (SELECT 1 FROM user_mfa_totp_factors AS factor
              WHERE factor.id=session.mfa_factor_id
                AND factor.user_id=session.user_id AND factor.state='ACTIVE')
              AS "factorCurrent"
     FROM staff_auth_sessions AS session
     INNER JOIN users AS actor ON actor.id=session.user_id AND actor.status='ACTIVE'
     WHERE session.id=$1::uuid AND session.user_id=$2::uuid
       AND session.current_access_token_hash=$3
       AND session.created_at=$4::timestamptz
       AND session.revoked_at IS NULL
       AND clock_timestamp()<session.access_expires_at
       AND clock_timestamp()<session.absolute_expires_at
     FOR SHARE OF session, actor`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new ManagementAccessDeniedError();
  }
  if (
    !localMfaBypassEnabled() &&
    evaluateMfaAssurance(
      {
        factorCurrent: row.factorCurrent,
        lastAdminActivityAt: row.lastAdminActivityAt,
        mfaAuthenticatedAt: row.mfaAuthenticatedAt,
        mfaFactorId: row.mfaFactorId,
      },
      row.now,
      false,
    ) !== "ASSURANCE_VALID"
  ) {
    throw new ManagementAccessDeniedError();
  }
}

type AlertSourceRole = "ORG_ADMIN" | "LOCATION_MANAGER";
interface AuthorityRow {
  readonly membershipId: string;
  readonly role: AlertSourceRole;
}

async function requireSourceRole(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput,
  category: "ALT-13" | "ALT-15",
): Promise<AuthorityRow> {
  requireAdministrativeAlertQuery(input);
  const companyCapability =
    category === "ALT-13"
      ? "STAFF_MANAGE_ELIGIBLE"
      : "TENANT_AUDIT_READ_ELIGIBLE";
  if (!isCompanyAdminManagementCapability(companyCapability))
    throw new ManagementAccessDeniedError();
  // Session/User before org advisory lock: compatible with Staff mutation,
  // MFA step-up and account-disable writers' session-first lock order.
  await requireProtectedReadSession(transaction, input.context);
  const roles: AlertSourceRole[] =
    category === "ALT-13" ? ["ORG_ADMIN", "LOCATION_MANAGER"] : ["ORG_ADMIN"];
  // Non-authoritative early hint prevents arbitrary foreign-tenant lock traffic.
  // This is NEVER used to decide source eligibility; that is re-read below.
  const hint = await transaction.query(
    `SELECT 1 FROM organization_memberships AS membership
     WHERE membership.organization_id=$1::uuid
       AND membership.user_id=$2::uuid
       AND membership.status='ACTIVE'
       AND membership.role=ANY($3::membership_role[])`,
    [input.organizationId, input.context.userId, roles],
  );
  if (hint.rowCount !== 1) throw new ManagementAccessDeniedError();
  const fence = await transaction.query<{ readonly readCommitted: boolean }>(
    `SELECT pg_advisory_xact_lock_shared(
       hashtextextended('staff-management-org:' || $1::text, 0)
     ), current_setting('transaction_isolation')='read committed'
       AS "readCommitted"`,
    [input.organizationId],
  );
  // A snapshot older than a just-committed role/grant revocation is forbidden.
  if (fence.rows[0]?.readCommitted !== true)
    throw new ManagementAccessDeniedError();
  // Recheck token expiry, assurance and factor AFTER waiting for the org lock.
  await requireProtectedReadSession(transaction, input.context);
  // The subscription table is deliberately SELECT-only under the runtime
  // role. PostgreSQL FOR SHARE OF subscription would demand a write-capable
  // privilege (42501); never broaden grants for this read-only alert.
  // Keep all permitted Staff/Organization row locks and the SHARED org fence,
  // and recheck current commercial entitlement in this post-fence statement.
  const current = await transaction.query<AuthorityRow>(
    `SELECT membership.id::text AS "membershipId",
            membership.role::text AS role
     FROM organization_memberships AS membership
     INNER JOIN users AS actor
       ON actor.id=membership.user_id AND actor.status='ACTIVE'
     INNER JOIN organizations AS organization
       ON organization.id=membership.organization_id AND organization.status='ACTIVE'
     INNER JOIN organization_subscriptions AS subscription
       ON subscription.organization_id=organization.id
      AND subscription.dashboard_access_enabled=TRUE
     WHERE membership.user_id=$1::uuid
       AND membership.organization_id=$2::uuid
       AND membership.status='ACTIVE'
       AND membership.role=ANY($3::membership_role[])
     FOR SHARE OF membership, actor, organization`,
    [input.context.userId, input.organizationId, roles],
  );
  const row = current.rows[0];
  if (current.rowCount !== 1 || row === undefined || !roles.includes(row.role))
    throw new ManagementAccessDeniedError();
  return row;
}

/** Source-specific Shift history: CA or LM with exact active Location grant. */
export async function authorizeForceEndedShiftAlert(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput & { readonly locationId: string },
): Promise<void> {
  if (!uuidPattern.test(input.locationId))
    throw new ManagementAccessDeniedError();
  const actor = await requireSourceRole(transaction, input, "ALT-13");
  if (actor.role === "ORG_ADMIN") {
    const active = await transaction.query(
      `SELECT 1 FROM locations
       WHERE id=$1::uuid AND organization_id=$2::uuid AND status='ACTIVE'
       FOR SHARE`,
      [input.locationId, input.organizationId],
    );
    if (active.rowCount !== 1) throw new ManagementAccessDeniedError();
    return;
  }
  const grant = await transaction.query(
    `SELECT 1 FROM membership_location_access AS access
     INNER JOIN locations AS location
       ON location.id=access.location_id
      AND location.organization_id=access.organization_id
      AND location.status='ACTIVE'
     WHERE access.organization_id=$1::uuid
       AND access.membership_id=$2::uuid
       AND access.location_id=$3::uuid
     FOR SHARE OF access, location`,
    [input.organizationId, actor.membershipId, input.locationId],
  );
  if (grant.rowCount !== 1) throw new ManagementAccessDeniedError();
}

/** Only the protected owning-Organization audit reader can see ALT-15. */
export async function authorizeStaffSecurityAlert(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput,
): Promise<void> {
  const actor = await requireSourceRole(transaction, input, "ALT-15");
  if (actor.role !== "ORG_ADMIN") throw new ManagementAccessDeniedError();
}
