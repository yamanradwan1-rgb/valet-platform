import type { EmployeeLocale } from "@valet/employee-client";

export interface NativePlateCameraCopy {
  readonly open: string;
  readonly close: string;
  readonly enter: string;
  readonly retry: string;
  readonly settings: string;
  readonly phases: Readonly<
    Record<
      "idle" | "requesting" | "starting" | "preview" | "denied" | "error",
      string
    >
  >;
}

const COPY: Record<EmployeeLocale, NativePlateCameraCopy> = {
  en: {
    open: "Open camera",
    close: "Close camera",
    enter: "Enter the plate I can see",
    retry: "Retry camera",
    settings: "Open camera settings",
    phases: {
      idle: "Use the camera to read the plate, or enter it manually. No automatic recognition or photo is taken.",
      requesting: "Requesting camera permission…",
      starting: "Starting rear camera…",
      preview:
        "Read the plate, then enter and confirm it. The camera closes before entry.",
      denied:
        "Camera permission was denied. You can enter the plate manually or continue without a readable plate.",
      error:
        "Camera unavailable. It may be busy or missing. Retry or enter the plate manually.",
    },
  },
  ar: {
    open: "فتح الكاميرا",
    close: "إغلاق الكاميرا",
    enter: "إدخال اللوحة التي أراها",
    retry: "إعادة محاولة الكاميرا",
    settings: "فتح إعدادات الكاميرا",
    phases: {
      idle: "استخدم الكاميرا لقراءة اللوحة أو أدخلها يدوياً. لا يوجد تعرّف تلقائي ولا يتم التقاط صورة.",
      requesting: "جارٍ طلب إذن الكاميرا…",
      starting: "جارٍ تشغيل الكاميرا الخلفية…",
      preview: "اقرأ اللوحة ثم أدخلها وأكّدها. تُغلق الكاميرا قبل الإدخال.",
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
