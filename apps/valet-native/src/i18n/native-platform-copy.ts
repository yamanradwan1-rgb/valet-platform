import type { EmployeeLocale } from "@valet/employee-client";

export interface NativePlatformCopy {
  readonly auth: {
    readonly authenticated: string;
    readonly fatal: string;
    readonly fatalTitle: string;
  };
  readonly camera: {
    readonly idle: string;
    readonly requesting: string;
    readonly noMatch: string;
    readonly unavailable: string;
    readonly denied: string;
    readonly error: string;
    readonly settings: string;
  };
  readonly scanner: {
    readonly disclaimer: string;
    readonly exit: string;
    readonly settings: string;
    readonly idle: string;
    readonly requesting: string;
    readonly accepted: string;
    readonly denied: string;
    readonly unavailable: string;
    readonly error: string;
  };
}

const platformCopy: Record<EmployeeLocale, NativePlatformCopy> = {
  en: {
    auth: {
      authenticated: "Secure employee session active",
      fatal: "Secure authentication is unavailable. Protected work is blocked.",
      fatalTitle: "Secure sign-in unavailable",
    },
    camera: {
      idle: "Open the camera to read the plate, or enter it manually.",
      requesting: "Requesting camera permission…",
      noMatch: "Couldn't read the plate. Try again or enter it manually.",
      unavailable:
        "Automatic plate reading is unavailable. Enter the plate manually or continue without a readable plate.",
      denied:
        "Camera permission was denied. You can enter the plate manually or continue without a readable plate.",
      error:
        "Camera unavailable. It may be busy or missing. Retry or enter the plate manually.",
      settings: "Open camera settings",
    },
    scanner: {
      disclaimer: "Resource input only. No assignment is performed.",
      exit: "Exit Scan",
      settings: "Open app settings",
      idle: "Camera closed. Permission is checked only when you open it.",
      requesting: "Checking camera permission…",
      accepted: "Input captured. Not verified or submitted.",
      denied: "Camera permission denied. Manual input remains available.",
      unavailable: "Camera unavailable. Use manual input.",
      error: "Camera could not start. Retry or use manual input.",
    },
  },
  ar: {
    auth: {
      authenticated: "جلسة الموظف الآمنة نشطة",
      fatal: "المصادقة الآمنة غير متاحة. تم حظر العمل المحمي.",
      fatalTitle: "تسجيل الدخول الآمن غير متاح",
    },
    camera: {
      idle: "افتح الكاميرا لقراءة اللوحة أو أدخلها يدوياً.",
      requesting: "جارٍ طلب إذن الكاميرا…",
      noMatch: "تعذر قراءة اللوحة. حاول مرة أخرى أو أدخلها يدويًا.",
      unavailable:
        "قراءة اللوحة تلقائيًا غير متاحة. أدخل اللوحة يدويًا أو تابع دون لوحة مقروءة.",
      denied:
        "تم رفض إذن الكاميرا. يمكنك إدخال اللوحة يدوياً أو المتابعة دون لوحة مقروءة.",
      error:
        "الكاميرا غير متاحة؛ قد تكون مشغولة أو غير موجودة. أعد المحاولة أو أدخل اللوحة يدوياً.",
      settings: "فتح إعدادات الكاميرا",
    },
    scanner: {
      disclaimer: "إدخال مورد فقط. لا يتم إجراء أي تعيين.",
      exit: "الخروج من المسح",
      settings: "فتح إعدادات التطبيق",
      idle: "الكاميرا مغلقة. يتم فحص الإذن عند فتحها فقط.",
      requesting: "جارٍ فحص إذن الكاميرا…",
      accepted: "تم التقاط الإدخال فقط. لم يتم التحقق أو الإرسال.",
      denied: "تم رفض إذن الكاميرا. الإدخال اليدوي متاح.",
      unavailable: "الكاميرا غير متاحة. استخدم الإدخال اليدوي.",
      error: "تعذر تشغيل الكاميرا. أعد المحاولة أو أدخل الرمز يدوياً.",
    },
  },
};

export function getNativePlatformCopy(
  locale: EmployeeLocale,
): NativePlatformCopy {
  return platformCopy[locale];
}
