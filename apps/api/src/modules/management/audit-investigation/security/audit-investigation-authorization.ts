import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { StaffSessionContext } from "../../../auth/staff-session-context";
import {
  authorizeManagementAuditLocation,
} from "../../management-audit-authorization";
import { ManagementAccessDeniedError } from "../../management-authorization";

/**
 * Purpose-limited scope for the new four-source Investigation read.
 * Never derive this from caller-supplied role, previous response or cursor.
 */
export interface AuditInvestigationLocationAuthorization {
  readonly organizationId: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly role: "ORG_ADMIN" | "LOCATION_MANAGER";
}

/**
 * Must run within the SAME transaction as containment, evidence queries and
 * the established Company Admin activity touch. The existing persisted Audit
 * guard owns exact credential/session, ACTIVE User/Organization/Membership,
 * MFA assurance, current Location grant and DASHBOARD_ACCESS enforcement.
 *
 * Existing Audit Events retains its broader Supervisor-scoped guard unchanged.
 */
export async function authorizeAuditInvestigationLocation(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locationId: string,
): Promise<AuditInvestigationLocationAuthorization> {
  const viewer = await authorizeManagementAuditLocation(
    transaction,
    context,
    organizationId,
    locationId,
  );

  if (
    viewer.scope !== "LOCATION" ||
    viewer.organizationId !== organizationId ||
    viewer.locationId !== locationId ||
    !viewer.membershipId ||
    (viewer.role !== "ORG_ADMIN" && viewer.role !== "LOCATION_MANAGER")
  ) {
    throw new ManagementAccessDeniedError();
  }

  return {
    organizationId: viewer.organizationId,
    locationId: viewer.locationId,
    membershipId: viewer.membershipId,
    role: viewer.role,
  };
}
