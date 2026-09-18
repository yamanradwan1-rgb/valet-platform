import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
} from "../management/management-authorization";
import { hasManagementCommercialAccess } from "../management/management-commercial-access-policy";
import {
  authorizeLiveMap,
  type LiveMapAuthorization,
} from "./live-map-authorization";

export async function authorizeLiveMapRead(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly locationId: string;
    readonly staffSessionContext?: StaffSessionContext;
  },
): Promise<LiveMapAuthorization | null> {
  const operational = await authorizeLiveMap(
    transaction,
    input.authenticatedUserId,
    input.locationId,
  );
  if (operational !== null) {
    return (await hasManagementCommercialAccess(
      transaction,
      operational.organizationId,
      "DASHBOARD_ACCESS",
    ))
      ? operational
      : null;
  }
  const context = input.staffSessionContext;
  if (context === undefined || context.userId !== input.authenticatedUserId)
    return null;
  const organizationId = await eligibleCompanyAdminLocationOrganization(
    transaction,
    context.userId,
    input.locationId,
  );
  if (organizationId === null) return null;
  await requireMfaAssuranceInTransaction(transaction, context);
  try {
    await authorizeCompanyAdminManagement(transaction, context, {
      capability: "LIVE_MAP_READ",
      organizationId,
      requireActiveLocation: true,
      targetLocationId: input.locationId,
    });
    const setting = await transaction.query<{
      readonly trackingEnabled: boolean;
    }>(
      `SELECT COALESCE(location.tracking_enabled_override,
                       organization.tracking_enabled) AS "trackingEnabled"
       FROM organizations AS organization
       INNER JOIN locations AS location
         ON location.organization_id = organization.id
       WHERE organization.id = $1 AND location.id = $2
         AND organization.status = 'ACTIVE' AND location.status = 'ACTIVE'`,
      [organizationId, input.locationId],
    );
    const trackingEnabled = setting.rows[0]?.trackingEnabled;
    if (setting.rowCount !== 1 || trackingEnabled === undefined) return null;
    await recordAdminActivityInTransaction(transaction, context);
    return { locationId: input.locationId, organizationId, trackingEnabled };
  } catch (error) {
    if ((error as { code?: unknown }).code === "AUTHORIZATION_DENIED")
      return null;
    throw error;
  }
}
