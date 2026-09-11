import type { EmployeeLocale } from "@valet/employee-client";

export interface NativePushCopy {
  readonly blocked: string;
  readonly channelUnavailable: string;
  readonly confirmed: string;
  readonly enable: string;
  readonly openSettings: string;
  readonly pending: string;
  readonly requestable: string;
  readonly unavailable: string;
}

const copy: Record<EmployeeLocale, NativePushCopy> = {
  ar: {
    blocked:
      "الإشعارات متوقفة. يمكنك تفعيلها من إعدادات Android. تستمر قائمة المهام بالتحديث.",
    channelUnavailable:
      "قناة تنبيهات الاسترجاع متوقفة. تحقق من إعدادات Android. تستمر قائمة المهام بالتحديث.",
    confirmed: "إشعارات مهام الاسترجاع مفعلة.",
    enable: "تفعيل",
    openSettings: "فتح الإعدادات",
    pending:
      "الإشعارات مفعلة، ولم يتم تأكيد تسجيل هذا الجهاز بعد. ستتم المحاولة عند عودة الاتصال.",
    requestable:
      "يمكنك تفعيل تنبيهات الاسترجاع. تستمر قائمة المهام بالتحديث في كل الأحوال.",
    unavailable: "الإشعارات غير متاحة الآن. تستمر قائمة المهام بالتحديث.",
  },
  en: {
    blocked:
      "Notifications are off. You can enable them in Android settings. The Task queue keeps refreshing.",
    channelUnavailable:
      "The retrieval alert channel is off. Check Android settings. The Task queue keeps refreshing.",
    confirmed: "Retrieval task notifications are enabled.",
    enable: "Enable",
    openSettings: "Open settings",
    pending:
      "Notifications are enabled, but this device is not yet confirmed. Registration will retry when connectivity returns.",
    requestable:
      "You can enable retrieval alerts. The Task queue keeps refreshing either way.",
    unavailable:
      "Notifications are unavailable right now. The Task queue keeps refreshing.",
  },
};

export function getNativePushCopy(locale: EmployeeLocale): NativePushCopy {
  return copy[locale];
}
