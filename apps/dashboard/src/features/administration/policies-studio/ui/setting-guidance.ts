import type { Locale, Section } from "./catalog";

export const sectionGuidance: Record<Section, [string, string]> = {
  operations: [
    "Photos, plate scan & handoff",
    "صور الدخول، قراءة اللوحة والتسليم",
  ],
  payments: ["Fees, payment methods & tips", "الرسوم، طرق الدفع والإكراميات"],
  hours: [
    "Weekly schedule & retrieval target",
    "الجدول الأسبوعي وهدف الاسترجاع",
  ],
  tracking: ["Task GPS & data retention", "GPS أثناء المهام ومدة الاحتفاظ"],
  notifications: ["Default language & alerts", "اللغة الافتراضية والتنبيهات"],
  presence: [
    "Checks at shift Start and End",
    "التحقق عند بدء المناوبة وإنهائها",
  ],
  zones: ["Places allowed for attendance", "الأماكن المعتمدة للتحقق من الحضور"],
  whatsapp: ["Guest-link sending policy", "سياسة إرسال رابط الضيف"],
};
const settingGuidance: Record<string, [string, string]> = {
  checkInPhotosRequired: [
    "Choose whether condition photos are mandatory at check-in.",
    "حدّد إن كانت صور حالة المركبة مطلوبة لإكمال الدخول.",
  ],
  handoffStandardMethodPolicy: [
    "Choose how a guest verifies pickup: code, QR, or either.",
    "اختر طريقة التحقق عند الاستلام: رمز، QR، أو إحدى الطريقتين.",
  ],
  ocrAssistEnabled: [
    "Help staff read the plate. Confirmation and manual entry remain available.",
    "ساعد الموظف في قراءة اللوحة، مع التأكيد وإمكانية الإدخال اليدوي.",
  ],
  parkingSpotRequired: [
    "Choose whether staff must record a specific parking spot.",
    "حدّد إن كان الموظف مطالبًا بتسجيل موقف محدد للمركبة.",
  ],
  valetServiceFee: [
    "Set the valet service fee for this scope.",
    "حدّد رسوم خدمة صف السيارات لهذا النطاق.",
  ],
  paymentServicePayer: [
    "Choose whether the customer or venue pays the service fee.",
    "حدّد من يتحمّل الرسوم: العميل أم المنشأة.",
  ],
  paymentMethodsPolicy: [
    "Choose cash, digital payment, or both.",
    "اختر الدفع النقدي، الرقمي، أو كليهما.",
  ],
  tipsEnabled: [
    "Allow tips where the payment flow supports them.",
    "اسمح بالإكراميات حيث يدعمها مسار الدفع.",
  ],
  validationEnabled: [
    "Enable supported full or partial validation workflows.",
    "فعّل مسارات المصادقة المدعومة على الرسوم.",
  ],
  releaseRequiresPayment: [
    "Choose whether payment is required before vehicle release.",
    "حدّد إن كان تسليم المركبة يتطلب إتمام الدفع.",
  ],
  trackingEnabled: [
    "Use GPS during eligible parking and retrieval tasks only.",
    "استخدم GPS أثناء مهام الركن والاسترجاع المؤهلة فقط.",
  ],
  rawGpsRetentionDays: [
    "Set how long raw task GPS records may be retained.",
    "حدّد مدة الاحتفاظ ببيانات GPS الخام المرتبطة بالمهام.",
  ],
  languageDefault: [
    "Choose the default language for supported experiences.",
    "اختر اللغة الافتراضية للتجارب التي تدعم هذا الإعداد.",
  ],
  employeeRetrievalRequestedNotificationEnabled: [
    "Allow employee alerts when a guest requests a vehicle.",
    "اسمح بتنبيه الموظف عند طلب الضيف استرجاع المركبة.",
  ],
  guestVehicleReadyNotificationEnabled: [
    "Allow guest alerts when the vehicle becomes ready.",
    "اسمح بتنبيه الضيف عندما تصبح المركبة جاهزة.",
  ],
  shiftStartPresenceMode: [
    "Choose whether starting a shift checks attendance, warns, or requires verification.",
    "حدّد مستوى التحقق من الحضور عند بدء المناوبة.",
  ],
  shiftEndPresenceMode: [
    "Choose attendance requirements independently for ending a shift.",
    "اضبط التحقق عند إنهاء المناوبة بشكل مستقل عن بدايتها.",
  ],
  shiftPresenceMaxAccuracyMeters: [
    "Maximum uncertainty accepted for an attendance GPS fix, in meters.",
    "أكبر هامش خطأ مقبول لقراءة موقع الحضور، بالأمتار.",
  ],
  shiftPresenceMaxFixAgeSeconds: [
    "Maximum age of an attendance GPS fix, in seconds.",
    "أقصى عمر مقبول لقراءة موقع الحضور، بالثواني.",
  ],
  slaTargetSeconds: [
    "Time from a retrieval request until the vehicle is ready, in seconds.",
    "الوقت المستهدف من طلب الاسترجاع حتى جاهزية المركبة، بالثواني.",
  ],
};
export function plainGuidance(key: string, locale: Locale) {
  return settingGuidance[key]?.[locale === "ar" ? 1 : 0];
}
