import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../../auth/staff-session-revalidation";
import { requireMfaAssuranceInTransaction } from "../../auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
} from "../../management/management-authorization";
import { authorizeStaffManagement } from "../../management/staff-management-authorization";

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

async function requireCurrentStaffSession(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  if (
    (await lockAndRecheckStaffSessionContext(transaction, context)) ===
    undefined
  ) {
    throw new ManagementAccessDeniedError();
  }
  // Acquire MFA's session+User locks before the Staff/Organization advisory
  // fence. Do not invert that order under concurrent role/MFA operations.
  // This only checks assurance; it never updates last_admin_activity_at.
  await requireMfaAssuranceInTransaction(transaction, context);
}

/** Reuses the Shift-history source role; an LM grant alone is not sufficient. */
export async function authorizeForceEndedShiftAlert(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput & { readonly locationId: string },
): Promise<void> {
  requireAdministrativeAlertQuery(input);
  if (!uuidPattern.test(input.locationId))
    throw new ManagementAccessDeniedError();
  await requireCurrentStaffSession(transaction, input.context);
  const authority = await authorizeStaffManagement(transaction, input.context, {
    organizationId: input.organizationId,
    assurance: "STANDARD",
  });
  if (
    authority.organizationId !== input.organizationId ||
    (authority.kind === "LOCATION_MANAGER" &&
      !authority.activeLocationIds?.includes(input.locationId))
  ) {
    throw new ManagementAccessDeniedError();
  }
  const location = await transaction.query(
    `SELECT 1 FROM locations
     WHERE id=$1::uuid AND organization_id=$2::uuid AND status='ACTIVE'
     FOR SHARE`,
    [input.locationId, input.organizationId],
  );
  if (location.rowCount !== 1) throw new ManagementAccessDeniedError();
}

/** Only the protected owning-Organization audit reader can see ALT-15. */
export async function authorizeStaffSecurityAlert(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput,
): Promise<void> {
  requireAdministrativeAlertQuery(input);
  await requireCurrentStaffSession(transaction, input.context);
  await authorizeCompanyAdminManagement(transaction, input.context, {
    capability: "TENANT_AUDIT_READ_ELIGIBLE",
    organizationId: input.organizationId,
  });
  // The owning audit authorizer checks CA role and protected MFA without
  // updating last_admin_activity_at (safe for an automatic notification read).
}
