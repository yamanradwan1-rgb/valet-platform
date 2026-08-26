/**
 * Subscription surface strings (D4-004): read-only plan, status and
 * entitlement facts. The backend exposes a single GET endpoint and no
 * billing/price/renewal data, so the copy stays strictly factual and the
 * null state stays neutral (DEC-062: no fabricated plan semantics).
 * Feature-local fragment; keys are deliberately disjoint from every other
 * section (guarded by sections/composition.test.ts).
 */

export interface SubscriptionStrings {
  "subscription.note": string;
  "subscription.fields.plan": string;
  "subscription.fields.status": string;
  "subscription.entitlements.heading": string;
  "subscription.entitlements.hint": string;
  "subscription.entitlement.dashboardAccess": string;
  "subscription.entitlement.reportExports": string;
  "subscription.entitlement.basicBranding": string;
  "subscription.entitlement.available": string;
  "subscription.entitlement.unavailable": string;
  "enum.subscription.TRIAL": string;
  "enum.subscription.ACTIVE": string;
  "enum.subscription.SUSPENDED": string;
  /**
   * Neutral null-subscription state. The backend returns subscription:null
   * exactly when the organization has no organization_subscriptions row
   * ("zero rows means no subscription"); nothing else is implied.
   */
  "subscription.none.title": string;
  "subscription.none.body": string;
  "subscription.state.loading": string;
  "subscription.state.loadFailed": string;
}

export const subscriptionEn: SubscriptionStrings = {
  "subscription.note":
    "This page shows the subscription facts recorded for this organization. The plan and entitlements cannot be changed here.",
  "subscription.fields.plan": "Plan",
  "subscription.fields.status": "Status",
  "subscription.entitlements.heading": "Entitlements",
  "subscription.entitlements.hint":
    "These reflect the current subscription state. They are managed by VAYLET and cannot be changed here.",
  "subscription.entitlement.dashboardAccess": "Dashboard access",
  "subscription.entitlement.reportExports": "Report exports",
  "subscription.entitlement.basicBranding": "Basic branding",
  "subscription.entitlement.available": "Available",
  "subscription.entitlement.unavailable": "Unavailable",
  "enum.subscription.TRIAL": "Trial",
  "enum.subscription.ACTIVE": "Active",
  "enum.subscription.SUSPENDED": "Suspended",
  "subscription.none.title": "No subscription information available",
  "subscription.none.body":
    "No subscription is recorded for this organization yet. Plan and entitlement details will appear here if a subscription is provisioned.",
  "subscription.state.loading": "Loading subscription…",
  "subscription.state.loadFailed":
    "The subscription could not be loaded. Check your connection and try again.",
};

export const subscriptionAr: SubscriptionStrings = {
  "subscription.note":
    "تعرض هذه الصفحة بيانات الاشتراك المسجَّلة لهذه المنشأة. لا يمكن تغيير الخطة أو الصلاحيات من هنا.",
  "subscription.fields.plan": "الخطة",
  "subscription.fields.status": "الحالة",
  "subscription.entitlements.heading": "الصلاحيات",
  "subscription.entitlements.hint":
    "تعكس هذه الصلاحيات حالة الاشتراك الحالية. تديرها فاليه ولا يمكن تغييرها من هنا.",
  "subscription.entitlement.dashboardAccess": "الوصول إلى لوحة الإدارة",
  "subscription.entitlement.reportExports": "تصدير التقارير",
  "subscription.entitlement.basicBranding": "الهوية البصرية الأساسية",
  "subscription.entitlement.available": "متاح",
  "subscription.entitlement.unavailable": "غير متاح",
  "enum.subscription.TRIAL": "تجريبي",
  "enum.subscription.ACTIVE": "نشط",
  "enum.subscription.SUSPENDED": "موقوف",
  "subscription.none.title": "لا تتوفر معلومات اشتراك",
  "subscription.none.body":
    "لا يوجد اشتراك مسجَّل لهذه المنشأة حتى الآن. ستظهر تفاصيل الخطة والصلاحيات هنا عند تجهيز اشتراك.",
  "subscription.state.loading": "جارٍ تحميل بيانات الاشتراك…",
  "subscription.state.loadFailed":
    "تعذر تحميل بيانات الاشتراك. تحقق من اتصالك وحاول مرة أخرى.",
};
