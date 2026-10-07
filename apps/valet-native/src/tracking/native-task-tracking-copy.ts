import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeTaskTrackingCopy {
  readonly activeParking: string;
  readonly activeRetrieval: string;
  readonly ambiguous: string;
  readonly openSettings: string;
  readonly parkingConditional: string;
  readonly permissionBlocked: string;
  readonly permissionDenied: string;
  readonly retry: string;
  readonly servicesDisabled: string;
  readonly unavailable: string;
}

const en: NativeTaskTrackingCopy = {
  activeParking: "Foreground location tracking is active for this Parking movement.",
  activeRetrieval:
    "Foreground location tracking is active for this Retrieval movement.",
  ambiguous:
    "Location tracking is paused because more than one active movement was found. Refreshing server state will resume it only when one movement is authoritative.",
  openSettings: "Open Settings",
  parkingConditional:
    "Foreground location tracking may run only while this Parking movement is active, tracking is enabled, and location access is available.",
  permissionBlocked:
    "Location access is disabled for VAYLET. Tracking stays paused until you enable location permission in Settings.",
  permissionDenied:
    "Location access is required only while this active Parking or Retrieval movement is being tracked. Tracking is paused.",
  retry: "Try Again",
  servicesDisabled:
    "Device location services are off. Tracking stays paused until location services are enabled.",
  unavailable:
    "Task location tracking is temporarily unavailable. No business action was changed. Check the connection and try again.",
};

const ar: NativeTaskTrackingCopy = {
  activeParking: "تتبّع الموقع في الواجهة الأمامية فعّال لحركة الاصطفاف الحالية.",
  activeRetrieval: "تتبّع الموقع في الواجهة الأمامية فعّال لحركة الاسترجاع الحالية.",
  ambiguous:
    "تم إيقاف تتبّع الموقع لأن الخادم وجد أكثر من حركة فعّالة. سيستأنف التتبّع فقط بعد أن تصبح حركة واحدة هي المعتمدة.",
  openSettings: "فتح الإعدادات",
  parkingConditional:
    "قد يعمل تتبّع الموقع في الواجهة الأمامية فقط أثناء حركة الاصطفاف الفعّالة، وعندما يكون التتبّع مفعّلًا وتتوفر صلاحية الموقع.",
  permissionBlocked:
    "صلاحية الموقع معطلة لتطبيق VAYLET. سيبقى التتبّع متوقفًا حتى تفعيل الصلاحية من الإعدادات.",
  permissionDenied:
    "صلاحية الموقع مطلوبة فقط أثناء تتبّع حركة اصطفاف أو استرجاع فعّالة. التتبّع متوقف حاليًا.",
  retry: "إعادة المحاولة",
  servicesDisabled:
    "خدمات الموقع في الجهاز متوقفة. سيبقى التتبّع متوقفًا حتى تفعيل خدمات الموقع.",
  unavailable:
    "تتبّع موقع المهمة غير متاح مؤقتًا. لم تتغير أي حالة تشغيلية. تحقق من الاتصال ثم أعد المحاولة.",
};

export function getNativeTaskTrackingCopy(
  locale: FoundationLocale,
): NativeTaskTrackingCopy {
  return locale === "ar" ? ar : en;
}
