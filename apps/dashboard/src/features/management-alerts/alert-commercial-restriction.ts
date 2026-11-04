import { managementAlertsPhase23Enabled } from "./alert-feature-gate";

type SubscriptionUtilityScope =
  "COMPANY_ADMIN" | "COMPANY_ADMIN_SUBSCRIPTION" | "LOCATION_MANAGER" | "OTHER";

/**
 * DEC-111 ALT-17 is permitted ONLY within the already-authorized CA
 * subscription recovery utility. This does not elevate Dashboard entitlement.
 */
export function commercialRestrictionAttentionAllowed(input: {
  readonly authority: SubscriptionUtilityScope;
  readonly dashboardAccess: boolean | null;
  readonly loading: boolean;
  readonly hasError: boolean;
  readonly featureEnabled?: boolean;
}): boolean {
  return (
    (input.featureEnabled ?? managementAlertsPhase23Enabled) &&
    input.authority === "COMPANY_ADMIN_SUBSCRIPTION" &&
    !input.loading &&
    !input.hasError &&
    input.dashboardAccess !== true
  );
}

export const commercialRestrictionAttentionCopy = {
  en: "Important: Management Dashboard access is currently restricted. This subscription view remains available for authorized account review.",
  ar: "مهم: الوصول إلى لوحة الإدارة مقيّد حاليًا. يمكن مراجعة حالة الاشتراك من هذه الصفحة المصرّح بها فقط.",
} as const;
