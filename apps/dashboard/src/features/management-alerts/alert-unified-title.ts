import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";

/**
 * Closed, display-only translations of source-authored facts. Never inspect
 * metadata or infer a richer event subtype/chronology from an English title.
 * Unknown source titles are preserved exactly, rather than misrepresented.
 */
const arabicTitles: Readonly<Record<string, string>> = {
  "Emergency takeover": "استلام طارئ للمهمة",
  "Emergency task takeover": "استلام طارئ للمهمة",
  "Handoff verification exhausted": "فشل التحقق عند التسليم نهائيًا",
  "Supervisor handoff override": "تجاوز المشرف للتحقق عند التسليم",
  "Geofence violation recorded": "تسجيل مخالفة نطاق جغرافي",
  "Retrieval task stage delayed": "تأخر مرحلة استرجاع المركبة",
  "Vehicle ready for handoff": "المركبة جاهزة للتسليم",
  "Payment failed": "فشل تحصيل الدفع",
  "Payment outcome unconfirmed": "نتيجة الدفع غير مؤكدة",
  "Shift administratively ended": "إنهاء الوردية إداريًا",
  "Staff role changed": "تغيير صلاحية موظف",
  "Staff location access revoked": "إلغاء صلاحية موقع لموظف",
  "Location intake stopped": "توقف استقبال السيارات في الموقع",
  "Management Dashboard access restricted": "الوصول إلى لوحة الإدارة مقيّد",
};

export function unifiedAlertTitle(
  item: Pick<ManagementAlertUnifiedItem, "title">,
  locale: DashboardLocale,
): string {
  return locale === "ar" ? (arabicTitles[item.title] ?? item.title) : item.title;
}
