import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
  ManagementAccessDeniedError,
} from "../management/management-authorization";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";

export interface PhysicalResourceAuthority {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: "LOCATION_MANAGER" | "ORG_ADMIN";
}

export type PhysicalResourceAction = "CREATE" | "LABEL" | "LIST";

export async function authorizePhysicalResourceManagement(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  locationId: string,
  action: PhysicalResourceAction,
): Promise<PhysicalResourceAuthority> {
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
  const locationManager = await authorizeDashboardLocation(
    transaction,
    context.userId,
    locationId,
  );
  if (locationManager === null) throw new ManagementAccessDeniedError();
  return { ...locationManager, role: "LOCATION_MANAGER" };
}
