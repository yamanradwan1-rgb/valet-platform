/**
 * النسخة العربية لنصوص قائمة المركبات النشطة (VUI-011C، قرار DEC-066 §6–§12):
 * قراءة تشغيلية صادقة لموقع واحد — مع تنبيه الصفحة المحدودة، دون بحث، ودون
 * أي قيم مؤلَّفة. مفصولة عن القاموس الأساسي للحفاظ على حدود هيكلية الملفات
 * (docs/17).
 */
export const employeeArabicVehiclesDictionary = {
  vehiclesCheckedInLabel: "وقت الدخول",
  vehiclesDescriptorMissing: "التفاصيل قيد الإدخال",
  vehiclesDetailReadOnly:
    "عرض للقراءة فقط — تُنفَّذ الإجراءات من مهامها الخاصة.",
  vehiclesEmptyDetail:
    "تظهر المركبات هنا أثناء تنفيذ التسجيل أو الإيقاف أو الاسترجاع.",
  vehiclesEmptyTitle: "لا توجد مركبات نشطة الآن",
  vehiclesLoadFailed: "تعذّر تحميل قائمة المركبات.",
  vehiclesLoading: "جارٍ تحميل المركبات...",
  vehiclesRefreshing: "جارٍ التحديث...",
  vehiclesSubtitle: "المركبات النشطة حالياً في هذا الموقع",
  vehiclesTruncatedNotice:
    "يتم عرض أحدث المركبات النشطة فقط. قد توجد مركبات إضافية خارج هذه القائمة.",
  vehiclesUpdatedAtLabel: "آخر تحديث",
} as const;
