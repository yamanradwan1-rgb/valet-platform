import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../../auth/staff-session-revalidation";
import { requireMfaAssuranceInTransaction } from "../../auth/mfa/mfa-assurance-policy";
import { authorizeCompanyAdminManagement, ManagementAccessDeniedError } from "../../management/management-authorization";
import { authorizeManagementAuditLocation } from "../../management/management-audit-authorization";
import { authorizeDashboardReadLocation } from "../dashboard-read-authorization";
import type { SeenOccurrenceCategory } from "./management-alert-seen-source";

interface SeenAudience {
  readonly organizationId: string;
  readonly userId: string;
}

const deny = () => new ManagementAccessDeniedError();

/** Source authority is checked BEFORE probing any occurrence or receipt row. */
export async function authorizeSeenOccurrenceAudience(
  transaction: PostgresTransaction,
  input: {
    readonly context: StaffSessionContext;
    readonly locationId: string;
    readonly category: SeenOccurrenceCategory;
  },
): Promise<SeenAudience> {
  const context = input.context;
  if (!(await lockAndRecheckStaffSessionContext(transaction, context))) throw deny();
  const scope = await authorizeDashboardReadLocation(transaction, {
    authenticatedUserId: context.userId,
    capability: "LOCATION_DASHBOARD_READ",
    recordActivity: false,
    staffSessionContext: context,
    targetLocationId: input.locationId,
  });
  if (scope === null || scope.locationId !== input.locationId) throw deny();
  const actor = await transaction.query<{ readonly role: string }>(
    `SELECT role::text AS role FROM organization_memberships
     WHERE id = $1 AND user_id = $2 AND organization_id = $3
       AND status = 'ACTIVE'`,
    [scope.membershipId, context.userId, scope.organizationId],
  );
  const role = actor.rows[0]?.role;
  if (role !== "ORG_ADMIN" && role !== "LOCATION_MANAGER") throw deny();
  // Existing Shift history has LM access to exactly their granted Location.
  // ALT-07 requires the exact existing handoff-audit scope; ALT-09 has its own
  // redacted tracking-enabled projection. ALT-05 and ALT-15 are CA-only.
  if (role === "LOCATION_MANAGER") {
    if (!["ALT-07", "ALT-09", "ALT-13"].includes(input.category)) throw deny();
  }
  if (input.category === "ALT-05" || input.category === "ALT-07") {
    const audit = await authorizeManagementAuditLocation(
      transaction, context, scope.organizationId, scope.locationId,
    );
    if (audit.membershipId !== scope.membershipId ||
        audit.organizationId !== scope.organizationId ||
        audit.locationId !== scope.locationId ||
        (audit.role !== "ORG_ADMIN" &&
          !(input.category === "ALT-07" && audit.role === "LOCATION_MANAGER"))) {
      throw deny();
    }
    if (input.category === "ALT-05") {
      await requireMfaAssuranceInTransaction(transaction, context, {
        sensitive: true,
      });
    }
  }
  if (input.category === "ALT-09") {
    const source = await transaction.query<{ readonly trackingEnabled: boolean }>(
      `SELECT COALESCE(location.tracking_enabled_override,
                       organization.tracking_enabled) AS "trackingEnabled"
       FROM locations AS location
       INNER JOIN organizations AS organization
         ON organization.id=location.organization_id AND organization.status='ACTIVE'
       WHERE location.id=$1 AND organization.id=$2 AND location.status='ACTIVE'`,
      [scope.locationId, scope.organizationId],
    );
    if (source.rowCount !== 1 || source.rows[0]?.trackingEnabled !== true) {
      throw deny();
    }
  }
  if (role === "ORG_ADMIN" &&
    (input.category === "ALT-05" || input.category === "ALT-13" ||
      input.category === "ALT-15")) {
    await authorizeCompanyAdminManagement(transaction, context, {
      capability: input.category === "ALT-05"
        ? "TENANT_AUDIT_READ_ELIGIBLE"
        : "STAFF_MANAGE_ELIGIBLE",
      commercialRequirement: "DASHBOARD_ACCESS",
      organizationId: scope.organizationId,
      requireActiveLocation: true,
      targetLocationId: input.locationId,
    });
  }
  return { organizationId: scope.organizationId, userId: context.userId };
}
