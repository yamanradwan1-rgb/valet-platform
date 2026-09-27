import type { ManagementAuditKnownEvent } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";

// Public event catalog only. Labels describe the recorded fact, not a new workflow.
const events = {
  VALET_SESSION_CREATED: ["Valet session created", "إنشاء جلسة صف المركبة"],
  CHECK_IN_CONDITION_NOTE_RECORDED: [
    "Check-in condition note recorded",
    "تسجيل ملاحظة حالة عند الاستلام",
  ],
  CHECK_IN_CONDITION_NOTE_CORRECTED: [
    "Check-in condition note corrected",
    "تصحيح ملاحظة حالة عند الاستلام",
  ],
  CHECK_IN_CONDITION_PHOTO_REGISTERED: [
    "Check-in condition photo registered",
    "تسجيل صورة الحالة عند الاستلام",
  ],
  VALET_SESSION_CHECK_IN_CONDITION_COMPLETED: [
    "Check-in condition review completed",
    "اكتمال مراجعة الحالة عند الاستلام",
  ],
  GUEST_ACCESS_ISSUED: ["Guest access issued", "إصدار وصول الضيف"],
  GUEST_ACCESS_ROTATED: ["Guest access replaced", "استبدال وصول الضيف"],
  GUEST_ACCESS_REVOKED: ["Guest access revoked", "إلغاء وصول الضيف"],
  VEHICLE_CONFIRMED_PLATE_IDENTITY_SET: [
    "Confirmed plate recorded",
    "تسجيل اللوحة المؤكدة",
  ],
  VEHICLE_CONFIRMED_PLATE_IDENTITY_CORRECTED: [
    "Confirmed plate corrected",
    "تصحيح اللوحة المؤكدة",
  ],
  VEHICLE_TEMPORARY_DESCRIPTOR_IDENTITY_SET: [
    "Temporary vehicle description recorded",
    "تسجيل الوصف المؤقت للمركبة",
  ],
  VEHICLE_TEMPORARY_DESCRIPTOR_IDENTITY_CORRECTED: [
    "Temporary vehicle description corrected",
    "تصحيح الوصف المؤقت للمركبة",
  ],
  VEHICLE_DETAILS_CORRECTED: [
    "Vehicle details corrected",
    "تصحيح تفاصيل المركبة",
  ],
  VALET_SESSION_CHECK_IN_COMPLETED: [
    "Check-in completed",
    "اكتمال استلام المركبة",
  ],
  VALET_SESSION_KEY_SLOT_ASSIGNED: ["Key slot assigned", "تعيين خانة المفتاح"],
  VALET_SESSION_KEY_SLOT_REASSIGNED: [
    "Key slot reassigned",
    "إعادة تعيين خانة المفتاح",
  ],
  VALET_SESSION_KEY_SLOT_CLEARED: ["Key slot cleared", "إخلاء خانة المفتاح"],
  TASK_ASSIGNED: ["Task assigned", "إسناد المهمة"],
  TASK_ACCEPTED: ["Task accepted", "قبول المهمة"],
  TASK_DECLINED: ["Task declined", "رفض المهمة"],
  TASK_REASSIGNED: ["Task reassigned", "إعادة إسناد المهمة"],
  SHIFT_STARTED: ["Shift started", "بدء الوردية"],
  SHIFT_ENDED: ["Shift ended", "انتهاء الوردية"],
  VALET_SESSION_PARKING_STARTED: ["Parking started", "بدء الاصطفاف"],
  VALET_SESSION_PARKED: ["Vehicle parked", "اصطفاف المركبة"],
  RETRIEVAL_REQUESTED: ["Retrieval requested", "طلب استرجاع المركبة"],
  RETRIEVAL_CANCELLED: ["Retrieval cancelled", "إلغاء استرجاع المركبة"],
  VALET_SESSION_RETRIEVAL_STARTED: ["Retrieval started", "بدء استرجاع المركبة"],
  VALET_SESSION_READY: ["Vehicle ready", "المركبة جاهزة"],
  VALET_SESSION_HANDOFF_INITIATED: ["Handoff initiated", "بدء التسليم"],
  HANDOFF_VERIFICATION_ISSUED: [
    "Handoff verification issued",
    "إصدار تحقق التسليم",
  ],
  HANDOFF_VERIFICATION_ROTATED: [
    "Handoff verification replaced",
    "استبدال تحقق التسليم",
  ],
  HANDOFF_VERIFICATION_FAILED: [
    "Handoff verification failed",
    "فشل تحقق التسليم",
  ],
  HANDOFF_VERIFIED: ["Handoff verified", "التحقق من التسليم"],
  HANDOFF_SUPERVISOR_OVERRIDE: [
    "Supervisor handoff override",
    "تجاوز المشرف للتحقق من التسليم",
  ],
  VALET_SESSION_HANDOFF_ABORTED: ["Handoff aborted", "إلغاء التسليم"],
  VALET_SESSION_VEHICLE_RELEASED: ["Vehicle released", "تسليم المركبة"],
  VALET_SESSION_COMPLETED: [
    "Valet session completed",
    "اكتمال جلسة صف المركبة",
  ],
  INCIDENT_OPENED: ["Incident opened", "فتح حادث"],
  PAYMENT_INITIALIZED: ["Payment initialized", "تهيئة الدفع"],
  PAYMENT_TIP_UPDATED: ["Tip updated", "تحديث الإكرامية"],
  PAYMENT_PAYER_CORRECTED: ["Payer corrected", "تصحيح الجهة الدافعة"],
  PAYMENT_SERVICE_AMOUNT_CORRECTED: [
    "Service amount corrected",
    "تصحيح مبلغ الخدمة",
  ],
  VALIDATION_APPLIED: ["Validation applied", "تطبيق الإعفاء"],
  VALIDATION_REPLACED: ["Validation replaced", "استبدال الإعفاء"],
  VALIDATION_REMOVED: ["Validation removed", "إزالة الإعفاء"],
  PAYMENT_CASH_RECEIVED: ["Cash received", "استلام النقد"],
  PAYMENT_CASH_ADJUSTED_INCREASE: [
    "Cash amount increased",
    "زيادة المبلغ النقدي",
  ],
  PAYMENT_CASH_ADJUSTED_DECREASE: [
    "Cash amount decreased",
    "خفض المبلغ النقدي",
  ],
  PAYMENT_COLLECTION_PREPARED: [
    "Payment collection prepared",
    "تجهيز تحصيل الدفع",
  ],
  PAYMENT_COLLECTION_DISPATCH_GUARDED: [
    "Collection dispatch checked",
    "فحص إرسال التحصيل",
  ],
  PAYMENT_COLLECTION_REFERENCE_ATTACHED: [
    "Collection reference attached",
    "إرفاق مرجع التحصيل",
  ],
  PAYMENT_COLLECTION_REJECTED: [
    "Payment collection rejected",
    "رفض تحصيل الدفع",
  ],
  PROVIDER_EVENT_COLLECTION_SUCCEEDED: [
    "Provider reported collection success",
    "أبلغ المزود عن نجاح التحصيل",
  ],
  PROVIDER_EVENT_COLLECTION_FAILED: [
    "Provider reported collection failure",
    "أبلغ المزود عن فشل التحصيل",
  ],
  PROVIDER_EVENT_REFUND_SUCCEEDED: [
    "Provider reported refund success",
    "أبلغ المزود عن نجاح الاسترداد",
  ],
  PROVIDER_EVENT_REFUND_FAILED: [
    "Provider reported refund failure",
    "أبلغ المزود عن فشل الاسترداد",
  ],
  PROVIDER_EVENT_NO_FINANCIAL_CHANGE: [
    "Provider event with no financial change",
    "حدث مزود دون تغيير مالي",
  ],
  PAYMENT_REFUND_CREATED: ["Refund created", "إنشاء استرداد"],
  MAP_SETUP_POINT_CREATED: ["Map point created", "إنشاء نقطة خريطة"],
  MAP_SETUP_POINT_UPDATED: ["Map point updated", "تحديث نقطة خريطة"],
  MAP_SETUP_AREA_CREATED: ["Map area created", "إنشاء منطقة خريطة"],
  MAP_SETUP_AREA_UPDATED: ["Map area updated", "تحديث منطقة خريطة"],
  MAP_SETUP_AREA_VERTICES_REPLACED: [
    "Map area boundary replaced",
    "استبدال حدود منطقة الخريطة",
  ],
  LOCATION_CONFIGURATION_OVERRIDE_SET: [
    "Location configuration override set",
    "تعيين تجاوز إعداد الموقع",
  ],
  LOCATION_CONFIGURATION_OVERRIDE_CLEAR: [
    "Location configuration override cleared",
    "إزالة تجاوز إعداد الموقع",
  ],
  DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED: [
    "Location branding override changed",
    "تغيير تجاوز هوية الموقع",
  ],
  DASHBOARD_REPORT_EXPORT_GENERATED: [
    "Report export generated",
    "إنشاء تصدير التقرير",
  ],
  STAFF_ACCOUNT_PROVISIONED: ["Staff account provisioned", "إنشاء حساب موظف"],
  STAFF_ROLE_CHANGED: ["Staff role changed", "تغيير دور الموظف"],
  STAFF_MEMBERSHIP_ACTIVATED: [
    "Staff membership activated",
    "تفعيل عضوية الموظف",
  ],
  STAFF_MEMBERSHIP_DEACTIVATED: [
    "Staff membership deactivated",
    "تعطيل عضوية الموظف",
  ],
  STAFF_LOCATION_ACCESS_GRANTED: [
    "Staff Location access granted",
    "منح الموظف وصول الموقع",
  ],
  STAFF_LOCATION_ACCESS_REVOKED: [
    "Staff Location access revoked",
    "إلغاء وصول الموظف للموقع",
  ],
  MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED: [
    "Company setting default changed",
    "تغيير إعداد الشركة الافتراضي",
  ],
  MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED: [
    "Location setting override changed",
    "تغيير تجاوز إعداد الموقع",
  ],
  MANAGEMENT_LOCATION_SLA_TARGET_CHANGED: [
    "Location service target changed",
    "تغيير هدف الخدمة للموقع",
  ],
  MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED: [
    "Company branding default changed",
    "تغيير هوية الشركة الافتراضية",
  ],
  MANAGEMENT_LOCATION_BRANDING_OVERRIDE_CHANGED: [
    "Location branding override changed",
    "تغيير تجاوز هوية الموقع",
  ],
  LOCATION_CREATED: ["Location created", "إنشاء الموقع"],
  LOCATION_ACTIVATED: ["Location activated", "تفعيل الموقع"],
  LOCATION_INTAKE_STOPPED: [
    "Location intake stopped",
    "إيقاف استقبال المركبات بالموقع",
  ],
  LOCATION_DEACTIVATED: ["Location deactivated", "تعطيل الموقع"],
  LOCATION_CURRENCY_CORRECTED: [
    "Location currency corrected",
    "تصحيح عملة الموقع",
  ],
  LOCATION_TIMEZONE_CORRECTED: [
    "Location timezone corrected",
    "تصحيح المنطقة الزمنية للموقع",
  ],
  VISIT_CONTACT_NAME_CORRECTED: [
    "Visit contact name corrected",
    "تصحيح اسم جهة اتصال الزيارة",
  ],
  VISIT_CONTACT_PHONE_CORRECTED: [
    "Visit contact phone corrected",
    "تصحيح هاتف جهة اتصال الزيارة",
  ],
} satisfies Record<ManagementAuditKnownEvent, readonly [string, string]>;

export function auditEventLabel(
  eventType: ManagementAuditKnownEvent | "UNKNOWN",
  locale: DashboardLocale,
): string {
  if (eventType === "UNKNOWN")
    return locale === "ar" ? "حدث غير معروف" : "Unknown event";
  return events[eventType][locale === "ar" ? 1 : 0];
}
