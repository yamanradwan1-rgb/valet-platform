import type { EmployeeLocale } from "@valet/employee-client";

export interface NativePushCopy {
  readonly blocked: string;
  readonly channelUnavailable: string;
  readonly confirmed: string;
  readonly enable: string;
  readonly networkUnavailable: string;
  readonly openSettings: string;
  readonly pending: string;
  readonly registrationError: string;
  readonly requestable: string;
  readonly tokenUnavailable: string;
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
    networkUnavailable:
      "الإشعارات مفعلة، ولكن تعذّر الوصول إلى خدمة تسجيل الجهاز. ستتم المحاولة عند عودة الاتصال.",
    openSettings: "فتح الإعدادات",
    pending: "جارٍ تأكيد تسجيل هذا الجهاز للإشعارات.",
    registrationError:
      "الإشعارات مفعلة، ولكن تعذّر تأكيد تسجيل الجهاز. سنعيد المحاولة تلقائيًا.",
    requestable:
      "يمكنك تفعيل تنبيهات الاسترجاع. تستمر قائمة المهام بالتحديث في كل الأحوال.",
    tokenUnavailable:
      "الإشعارات مفعلة، ولكن رمز إشعارات الجهاز غير متاح بعد. سنعيد المحاولة تلقائيًا.",
    unavailable: "الإشعارات غير متاحة الآن. تستمر قائمة المهام بالتحديث.",
  },
  en: {
    blocked:
      "Notifications are off. You can enable them in Android settings. The Task queue keeps refreshing.",
    channelUnavailable:
      "The retrieval alert channel is off. Check Android settings. The Task queue keeps refreshing.",
    confirmed: "Retrieval task notifications are enabled.",
    enable: "Enable",
    networkUnavailable:
      "Notifications are enabled, but the device registration service could not be reached. Registration will retry when connectivity returns.",
    openSettings: "Open settings",
    pending: "Confirming this device for notifications.",
    registrationError:
      "Notifications are enabled, but device registration could not be confirmed. We'll retry automatically.",
    requestable:
      "You can enable retrieval alerts. The Task queue keeps refreshing either way.",
    tokenUnavailable:
      "Notifications are enabled, but a device notification token is not available yet. We'll retry automatically.",
    unavailable:
      "Notifications are unavailable right now. The Task queue keeps refreshing.",
  },
};

export function getNativePushCopy(locale: EmployeeLocale): NativePushCopy {
  return copy[locale];
}
