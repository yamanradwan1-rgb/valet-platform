import type { NativeTextAlign } from "./native-check-in-primitives";

const COPY = {
  left: {
    open: "Open camera",
    close: "Close camera",
    enter: "Enter the plate I can see",
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
  right: {
    open: "فتح الكاميرا",
    close: "إغلاق الكاميرا",
    enter: "إدخال اللوحة التي أراها",
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

export function getNativePlateCameraCopy(textAlign: NativeTextAlign) {
  return COPY[textAlign];
}
