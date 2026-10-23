import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
  ManagementAccessDeniedError,
} from "../management/management-authorization";
import {
  authorizeDashboardLocation,
  type DashboardLocationScope,
} from "./dashboard-location-authorization";

export interface PhysicalResourceAuthority {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: "LOCATION_MANAGER" | "ORG_ADMIN";
}

export type PhysicalResourceAction = "CREATE" | "LABEL" | "LIST";

/** Internal reader modes; CREATE callers retain their existing authority path. */
export type PhysicalResourceReadFence =
  | { readonly kind: "READ_COMMITTED" }
  | {
      readonly kind: "PRELOCKED_RR_LOCATION_MANAGER";
      readonly hint: DashboardLocationScope;
    }
  | { readonly kind: "RR_COMPANY_ADMIN_ONLY" };

export async function authorizePhysicalResourceManagement(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  locationId: string,
  action: PhysicalResourceAction,
  readFence?: PhysicalResourceReadFence,
): Promise<PhysicalResourceAuthority> {
  if (readFence?.kind === "PRELOCKED_RR_LOCATION_MANAGER") {
    // The overview reader took the writer-compatible SESSION advisory before
    // BEGIN RR. Recheck the hint against that fresh snapshot; never promote
    // a held shared lock to the Company Admin's exclusive advisory lock.
    const manager = await authorizeDashboardLocation(
      transaction, context.userId, locationId,
    );
    if (
      manager === null ||
      manager.membershipId !== readFence.hint.membershipId ||
      manager.organizationId !== readFence.hint.organizationId
    ) throw new ManagementAccessDeniedError();
    return { ...manager, role: "LOCATION_MANAGER" };
  }

  const requiresActiveLocation = action !== "LIST";
  const companyOrganizationId = await eligibleCompanyAdminLocationOrganization(
    transaction,
    context.userId,
    locationId,
    requiresActiveLocation,
  );
  if (companyOrganizationId !== null) {
    const authority = await authorizeCompanyAdminManagement(transaction, context, {
      assurance: action === "CREATE" ? "SENSITIVE" : "STANDARD",
      capability: "PHYSICAL_RESOURCES_MANAGE_ELIGIBLE",
      organizationId: companyOrganizationId,
      requireActiveLocation: requiresActiveLocation,
      targetLocationId: locationId,
    });
    return {
      locationId,
      membershipId: authority.membershipId,
      organizationId: authority.organizationId,
      role: "ORG_ADMIN",
    };
  }
  if (readFence?.kind === "RR_COMPANY_ADMIN_ONLY") {
    // An LM grant that appears after the pre-BEGIN hint is not authorized
    // without the session advisory; a new request may retry the LM path.
    throw new ManagementAccessDeniedError();
  }
  if (readFence?.kind === "READ_COMMITTED") {
    const hint = await authorizeDashboardLocation(
      transaction, context.userId, locationId,
    );
    if (hint === null) throw new ManagementAccessDeniedError();
    const fence = await transaction.query<{ readonly readCommitted: boolean }>(
      `SELECT pg_advisory_xact_lock_shared(
         hashtextextended('staff-management-org:' || $1::text, 0)
       ), current_setting('transaction_isolation') = 'read committed'
         AS "readCommitted"`,
      [hint.organizationId],
    );
    // READ COMMITTED gets a new snapshot after a preceding grant writer.
    // Both its exact grant and the shared fence stay valid until COMMIT.
    if (fence.rows[0]?.readCommitted !== true)
      throw new ManagementAccessDeniedError();
    const manager = await authorizeDashboardLocation(
      transaction, context.userId, locationId,
    );
    if (
      manager === null ||
      manager.membershipId !== hint.membershipId ||
      manager.organizationId !== hint.organizationId
    ) throw new ManagementAccessDeniedError();
    return { ...manager, role: "LOCATION_MANAGER" };
  }

  // The four-argument CREATE call sites deliberately keep prior semantics.
  const locationManager = await authorizeDashboardLocation(
    transaction,
    context.userId,
    locationId,
  );
  if (locationManager === null) throw new ManagementAccessDeniedError();
  return { ...locationManager, role: "LOCATION_MANAGER" };
}
