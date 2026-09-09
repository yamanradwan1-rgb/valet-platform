import type { EmployeeLocale } from "@valet/employee-client";

export interface NativePlateCameraCopy {
  readonly capture: string;
  readonly open: string;
  readonly close: string;
  readonly enter: string;
  readonly retry: string;
  readonly settings: string;
  readonly phases: Readonly<
    Record<
      | "idle"
      | "requesting"
      | "starting"
      | "preview"
      | "denied"
      | "error"
      | "no-match"
      | "unavailable",
      string
    >
  >;
}

const COPY: Record<EmployeeLocale, NativePlateCameraCopy> = {
  en: {
    capture: "Capture plate image",
    open: "Open plate camera",
    close: "Close camera",
    enter: "Enter manually",
    retry: "Try camera again",
    settings: "Open camera settings",
    phases: {
      idle: "Open the camera to read the plate, or enter it manually.",
      requesting: "Requesting camera permission…",
      starting: "Starting rear camera…",
      preview:
        "Position the plate in the frame, then capture one reference image.",
      "no-match": "Couldn't read the plate. Try again or enter it manually.",
      unavailable:
        "Automatic plate reading is unavailable. Enter the plate manually or continue without a readable plate.",
      denied:
        "Camera permission was denied. You can enter the plate manually or continue without a readable plate.",
      error:
        "Camera unavailable. It may be busy or missing. Retry or enter the plate manually.",
    },
  },
  ar: {
    capture: "التقاط صورة اللوحة",
    open: "فتح كاميرا اللوحة",
    close: "إغلاق الكاميرا",
    enter: "إدخال يدوي",
    retry: "إعادة محاولة تشغيل الكاميرا",
    settings: "فتح إعدادات الكاميرا",
    phases: {
      idle: "افتح الكاميرا لقراءة اللوحة أو أدخلها يدوياً.",
      requesting: "جارٍ طلب إذن الكاميرا…",
      starting: "جارٍ تشغيل الكاميرا الخلفية…",
      preview: "ضع اللوحة داخل الإطار، ثم التقط صورة مرجعية واحدة.",
      "no-match": "تعذر قراءة اللوحة. حاول مرة أخرى أو أدخلها يدويًا.",
      unavailable:
        "قراءة اللوحة تلقائيًا غير متاحة. أدخل اللوحة يدويًا أو تابع دون لوحة مقروءة.",
      denied:
        "تم رفض إذن الكاميرا. يمكنك إدخال اللوحة يدوياً أو المتابعة دون لوحة مقروءة.",
      error:
        "الكاميرا غير متاحة؛ قد تكون مشغولة أو غير موجودة. أعد المحاولة أو أدخل اللوحة يدوياً.",
    },
  },
};

export function getNativePlateCameraCopy(locale: EmployeeLocale) {
  return COPY[locale];
}
