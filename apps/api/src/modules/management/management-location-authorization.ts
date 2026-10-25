import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";

/** Shared lifecycle authority; Resume receives exactly the existing Stop boundary. */
export function authorizeLocationLifecycle(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId?: string,
) {
  return authorizeCompanyAdminManagement(transaction, context, {
    assurance: "SENSITIVE",
    capability: "LOCATION_LIFECYCLE_MANAGE_ELIGIBLE",
    organizationId,
    ...(locationId === undefined
      ? {}
      : { requireActiveLocation: false, targetLocationId: locationId }),
  });
}
