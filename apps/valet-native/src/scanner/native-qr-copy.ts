import type {
  EmployeeLocale,
  QrCapturePhase,
  QrResourceKind,
} from "@valet/employee-client";

interface NativeQrCopy {
  title: string;
  disclaimer: string;
  open: string;
  again: string;
  close: string;
  exit: string;
  manual: string;
  manualHint: string;
  settings: string;
  invalid: string;
  kinds: Record<QrResourceKind, string>;
  phases: Record<QrCapturePhase, string>;
}

const copy: Record<EmployeeLocale, NativeQrCopy> = {
  en: {
    title: "Scan",
    disclaimer: "Resource input only. No assignment is performed.",
    open: "Open camera",
    again: "Scan again",
    close: "Close camera",
    exit: "Exit Scan",
    manual: "Resource code",
    manualHint:
      "Enter the resource code manually at any time. Camera access is optional.",
    settings: "Open app settings",
    invalid:
      "Wrong or invalid QR. Scan the expected label or enter the resource code.",
    kinds: {
      "key-slot": "Key Slot",
      "parking-spot": "Parking Spot",
    },
    phases: {
      idle: "Camera closed. Permission is checked only when you open it.",
      requesting: "Checking camera permission…",
      starting: "Starting camera…",
      scanning: "Point the rear camera at the QR code.",
      accepted: "Input captured. Not verified or submitted.",
      denied: "Camera permission denied. Manual input remains available.",
      unavailable: "Camera unavailable. Use manual input.",
      error: "Camera could not start. Retry or use manual input.",
    },
  },
  ar: {
    title: "المسح",
    disclaimer: "إدخال مورد فقط. لا يتم إجراء أي تعيين.",
    open: "فتح الكاميرا",
    again: "المسح مجدداً",
    close: "إغلاق الكاميرا",
    exit: "الخروج من المسح",
    manual: "رمز الموقع",
    manualHint:
      "يمكن إدخال رمز الموقع يدوياً في أي وقت. استخدام الكاميرا اختياري.",
    settings: "فتح إعدادات التطبيق",
    invalid: "رمز غير صالح أو من نوع آخر. امسح الرمز المطلوب أو أدخله يدوياً.",
    kinds: {
      "key-slot": "خانة المفتاح",
      "parking-spot": "موقف المركبة",
    },
    phases: {
      idle: "الكاميرا مغلقة. يتم فحص الإذن عند فتحها فقط.",
      requesting: "جارٍ فحص إذن الكاميرا…",
      starting: "جارٍ تشغيل الكاميرا…",
      scanning: "وجّه الكاميرا الخلفية نحو الرمز.",
      accepted: "تم التقاط الإدخال فقط. لم يتم التحقق أو الإرسال.",
      denied: "تم رفض إذن الكاميرا. الإدخال اليدوي متاح.",
      unavailable: "الكاميرا غير متاحة. استخدم الإدخال اليدوي.",
      error: "تعذر تشغيل الكاميرا. أعد المحاولة أو أدخل الرمز يدوياً.",
    },
  },
};

export function getNativeQrCopy(locale: EmployeeLocale): NativeQrCopy {
  return copy[locale];
}
