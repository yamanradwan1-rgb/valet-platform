/**
 * Employee camera/QR capture copy (VUI-012 / DEC-067) — Arabic. Mirrors the
 * English scanner fragment keys exactly; operational codes remain LTR
 * isolated by the existing bdi conventions.
 */
import type { EmployeeDictionary } from "./dictionary";
import { employeeEnglishScannerDictionary } from "./dictionary-en-scanner";

export const employeeArabicScannerDictionary: Pick<
  EmployeeDictionary,
  keyof typeof employeeEnglishScannerDictionary
> = {
  scannerCameraBusy:
    "الكاميرا مستخدمة من قبل تطبيق آخر. أغلقها ثم أعد المحاولة.",
  scannerCameraError: "تعذر تشغيل الكاميرا. يرجى المحاولة مرة أخرى.",
  scannerCameraPermissionDenied:
    "تم رفض الوصول إلى الكاميرا. اسمح بإذن الكاميرا من إعدادات المتصفح، أو أدخل الرمز يدويًا.",
  scannerCameraUnavailable:
    "الكاميرا غير متوفرة في هذا المتصفح أو تتطلب اتصالًا آمنًا.",
  scannerCloseScanner: "إغلاق الماسح",
  scannerManualAlwaysAvailable:
    "يمكنك إدخال الرمز يدويًا في أي وقت أدناه.",
  scannerNoCameraFound: "لم يتم العثور على كاميرا على هذا الجهاز.",
  scannerScanningHint: "وجّه الكاميرا نحو رمز QR",
  scannerStartingCamera: "جارٍ تشغيل الكاميرا...",
  scannerStartScan: "مسح رمز QR",
  scannerUnreadableQr: "تعذّرت قراءة رمز QR هذا كرمز صالح.",
  scannerWrongTypeHandoff: "رمز QR هذا ليس رمز تسليم الضيف.",
  scannerWrongTypeKeySlot: "رمز QR هذا ليس رمز خانة مفتاح.",
  scannerWrongTypeParkingSpot: "رمز QR هذا ليس رمز موقف سيارة.",
};
