import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import type { DashboardLocationScope } from "./dashboard-location-authorization";

export type PhaseOneManagementAlertCategory =
  "ALT-01" | "ALT-02" | "ALT-03" | "ALT-08" | "ALT-12";

const phaseOneCategories: ReadonlySet<string> = new Set([
  "ALT-01",
  "ALT-02",
  "ALT-03",
  "ALT-08",
  "ALT-12",
]);

/**
 * Shared Phase-1 audience gate. Call within the same READ COMMITTED
 * transaction as the bounded source query; each source reader must still
 * verify its category-specific source permission and current eligibility.
 */
export async function authorizeManagementAlertPhaseOneAudience(
  transaction: PostgresTransaction,
  input: {
    readonly category: PhaseOneManagementAlertCategory;
    readonly context: StaffSessionContext;
    readonly locationId: string;
  },
): Promise<DashboardLocationScope | null> {
  if (!phaseOneCategories.has(input.category)) return null;

  // The ordinary LM Dashboard read accepts a user ID. Alerts require an
  // exact current Staff session even for the LM audience, including refresh.
  if (
    (await lockAndRecheckStaffSessionContext(transaction, input.context)) ===
    undefined
  ) {
    return null;
  }

  // The Dashboard guard enforces CA MFA, active Organization/Location and
  // current entitlement, or LM exact LocationAccess with revocation fencing.
  // Neither CA alert polling nor scope revalidation can renew admin activity.
  return authorizeDashboardReadLocation(transaction, {
    authenticatedUserId: input.context.userId,
    capability: "LOCATION_DASHBOARD_READ",
    recordActivity: false,
    staffSessionContext: input.context,
    targetLocationId: input.locationId,
  });
}
