import type {
  SubscriptionEntitlements,
  SubscriptionStatus,
} from "@valet/contracts";

import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";

/**
 * Pure Subscription display rules (D4-004).
 *
 * Everything here is a READ-ONLY FACT mapper: raw backend enum values are
 * never rendered, and entitlement booleans never gate or disable anything —
 * the backend remains the sole authority for every action in this dashboard.
 * The Records are exhaustive over the shared contract types, so a newly
 * added backend enum member or entitlement breaks compilation until it is
 * given a label.
 */

/** The three contract entitlements, in stable display order. */
export const SUBSCRIPTION_ENTITLEMENT_ORDER = [
  "dashboardAccess",
  "reportExports",
  "basicBranding",
] as const satisfies readonly (keyof SubscriptionEntitlements)[];

export function subscriptionStatusLabelKey(
  status: SubscriptionStatus,
): TranslationKey {
  const keys: Record<SubscriptionStatus, TranslationKey> = {
    ACTIVE: "enum.subscription.ACTIVE",
    SUSPENDED: "enum.subscription.SUSPENDED",
    TRIAL: "enum.subscription.TRIAL",
  };
  return keys[status];
}

export function entitlementLabelKey(
  entitlement: keyof SubscriptionEntitlements,
): TranslationKey {
  const keys: Record<
    keyof SubscriptionEntitlements,
    TranslationKey
  > = {
    basicBranding: "subscription.entitlement.basicBranding",
    dashboardAccess: "subscription.entitlement.dashboardAccess",
    reportExports: "subscription.entitlement.reportExports",
  };
  return keys[entitlement];
}

/**
 * Truthful failure mapping. Raw SQL/error internals are never rendered;
 * every failure resolves to a typed, user-safe message key.
 */
export function subscriptionFailureMessageKey(
  error: unknown,
): TranslationKey {
  if (!(error instanceof DashboardApiError)) return "errors.requestFailed";
  if (error.isNetworkError) return "states.networkError";
  switch (error.kind) {
    case "session-expired":
      return "errors.sessionExpired";
    case "forbidden":
    case "authorization-masked":
      return "errors.accessDenied";
    case "rate-limited":
      return "errors.rateLimited";
    default:
      return "subscription.state.loadFailed";
  }
}
