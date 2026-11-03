import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "../dashboard-read-authorization";
import type { DashboardLocationScope } from "../dashboard-location-authorization";
import { DashboardOverviewError } from "../dashboard-overview-error";

export interface ManagementAlertSourceCase {
  readonly category: "ALT-01" | "ALT-02" | "ALT-03" | "ALT-08" | "ALT-12";
  readonly severity: "IMPORTANT" | "CRITICAL";
  readonly sourceKind: "RETRIEVAL" | "TASK" | "INCIDENT" | "PRESENCE";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly occurredAt: string;
  readonly title: string;
}

export interface ManagementAlertReaderInput {
  readonly context: StaffSessionContext;
  readonly scope: DashboardLocationScope;
  /** Hard per-family budget: 21 proves the 20+ badge after aggregation. */
  readonly limit: number;
}

/** Recheck the caller's currently entitled exact Location before any source probe. */
export async function requireManagementAlertSourceScope(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<DashboardLocationScope> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 21) {
    throw new RangeError("Management alert source limit must be 1..21.");
  }
  const scope = await authorizeDashboardReadLocation(transaction, {
    authenticatedUserId: input.context.userId,
    staffSessionContext: input.context,
    capability: "LOCATION_DASHBOARD_READ",
    targetLocationId: input.scope.locationId,
    recordActivity: false,
  });
  if (
    scope === null ||
    scope.organizationId !== input.scope.organizationId ||
    scope.locationId !== input.scope.locationId ||
    scope.membershipId !== input.scope.membershipId
  ) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return scope;
}
