import {
  SYNTHETIC_INCIDENT_SOURCE_ID,
  SYNTHETIC_INCIDENT_TARGET_ID,
  type SyntheticAlert,
  type SyntheticDestination,
  type SyntheticSourceId,
} from "./types";

// Completely invented records. Source IDs, locations and facts never come from VAYLET.
const downtown = { en: "Downtown Entrance", ar: "مدخل وسط البلد" };
const west = { en: "West Parking", ar: "الموقف الغربي" };
const north = { en: "North Lobby", ar: "المدخل الشمالي" };

export const demoLocations = {
  downtown, west, north,
} as const;
export type DemoLocation = keyof typeof demoLocations;
const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
export const future = (hoursAhead: number) => new Date(Date.now() + hoursAhead * 3_600_000).toISOString();
const unavailable = (sourceId: SyntheticSourceId): SyntheticDestination => ({
  state: "unavailable",
  sourceId,
  reason: "exact-target-unproven",
});

export const examples: SyntheticAlert[] = [
  {
    id: "SIM-INC-1042", category: "ALT-08", kind: "ACTIVE", severity: "CRITICAL",
    title: { en: "Critical incident needs attention", ar: "حادث حرج يحتاج متابعة" },
    description: {
      en: "A critical incident is marked Investigating at this location.",
      ar: "يوجد حادث مصنّف حرج وحالته قيد التحقيق في هذا الموقع.",
    },
    location: downtown, time: null,
    destination: {
      state: "available",
      sourceId: SYNTHETIC_INCIDENT_SOURCE_ID,
      targetId: SYNTHETIC_INCIDENT_TARGET_ID,
    },
    sourceSeverity: "CRITICAL", sourceStatus: "INVESTIGATING",
  },
  {
    id: "SIM-TASK-204", category: "ALT-02", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Unassigned parking task", ar: "مهمة إيقاف غير مسندة" },
    description: {
      en: "A queued parking task has exceeded its configured assignment delay.",
      ar: "تجاوزت مهمة اصطفاف بانتظار التعيين المدة المحددة.",
    },
    location: west, time: null, destination: unavailable("SIM-TASK-204"), sourceSubtype: "PARKING",
  },
  {
    id: "SIM-TASK-205", category: "ALT-03", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Unassigned after task decline", ar: "مهمة غير مسندة بعد الرفض" },
    description: {
      en: "This task remains unassigned after a recorded decline.",
      ar: "ما زالت المهمة دون إسناد بعد تسجيل رفضها.",
    },
    location: north, time: null, destination: unavailable("SIM-TASK-205"), sourceSubtype: "RETRIEVAL",
  },
  {
    id: "SIM-HANDOFF-31", category: "ALT-07", kind: "OCCURRENCE", severity: "CRITICAL",
    title: { en: "Handoff verification exhausted", ar: "استنفاد محاولات التحقق عند التسليم" },
    description: {
      en: "A committed handoff verification episode ended unsuccessfully.",
      ar: "انتهت واقعة موثقة للتحقق من تسليم المركبة دون نجاح.",
    },
    location: north, time: recent(1), destination: unavailable("SIM-HANDOFF-31"), sourceSubtype: "TERMINAL_FAILURE",
  },
  {
    id: "SIM-PAY-87", category: "ALT-11", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Payment outcome unconfirmed", ar: "نتيجة تحصيل الدفعة غير مؤكدة" },
    description: {
      en: "A guarded payment operation remains unresolved after its review delay.",
      ar: "عملية دفع محمية لا تزال غير محسومة بعد انقضاء مهلة المراجعة.",
    },
    location: downtown, time: null, destination: unavailable("SIM-PAY-87"),
  },
  {
    id: "SIM-SHIFT-54", category: "ALT-13", kind: "OCCURRENCE", severity: "IMPORTANT",
    title: { en: "Shift force-ended", ar: "إنهاء الوردية إجباريًا" },
    description: {
      en: "An authorized force-end event was committed for this location.",
      ar: "تم تسجيل حدث إنهاء إجباري معتمد لوردية هذا الموقع.",
    },
    location: west, time: recent(3), destination: unavailable("SIM-SHIFT-54"),
  },
  {
    id: "SIM-RET-12", category: "ALT-01", kind: "ACTIVE", severity: "CRITICAL",
    title: { en: "Retrieval SLA exceeded", ar: "تجاوز مدة استرجاع المركبة" },
    description: {
      en: "An active retrieval attempt crossed its saved response-time threshold.",
      ar: "تجاوز طلب استرجاع نشط مهلة الاستجابة المحفوظة له.",
    },
    location: north, time: null, destination: unavailable("SIM-RET-12"),
  },
  {
    id: "SIM-OPS-63", category: "ALT-05", kind: "OCCURRENCE", severity: "CRITICAL",
    title: { en: "Emergency task takeover", ar: "استلام طارئ للمهمة" },
    description: {
      en: "An emergency task takeover operation was committed.",
      ar: "تم تثبيت عملية استلام طارئ لإحدى المهام.",
    },
    location: downtown, time: recent(12), destination: unavailable("SIM-OPS-63"),
  },
  {
    id: "SIM-READY-06", category: "ALT-06", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Vehicle waiting for handoff", ar: "مركبة بانتظار التسليم" },
    description: {
      en: "This session has remained ready or handoff-pending beyond your alert delay.",
      ar: "بقيت الجلسة جاهزة أو بانتظار إتمام التسليم أكثر من مدة تنبيهك.",
    },
    location: north, time: null, destination: unavailable("SIM-READY-06"),
  },
  {
    id: "SIM-LOC-08", category: "ALT-16", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Location intake stopped", ar: "توقف استقبال المركبات" },
    description: {
      en: "An active location is currently not accepting new check-ins.",
      ar: "الموقع النشط لا يستقبل عمليات إدخال جديدة حالياً.",
    },
    location: west, time: null, destination: unavailable("SIM-LOC-08"),
  },
  {
    id: "SIM-PRESENCE-5", category: "ALT-12", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Presence exception needs review", ar: "استثناء حضور بانتظار المراجعة" },
    description: {
      en: "A pending, unexpired exception is eligible for your review.",
      ar: "يوجد استثناء غير منتهي ومعلّق ومتاح لمراجعتك.",
    },
    location: downtown, time: null, expiresAt: future(24), destination: unavailable("SIM-PRESENCE-5"),
  },
  {
    id: "SIM-GEO-44", category: "ALT-09", kind: "OCCURRENCE", severity: "CRITICAL",
    title: { en: "Geofence violation recorded", ar: "تسجيل مخالفة نطاق جغرافي" },
    description: {
      en: "A committed tracking-boundary violation was recorded; current position is unknown.",
      ar: "تم تسجيل تجاوز موثق لحدود التتبع؛ الموقع الحالي غير معلوم.",
    },
    location: north, time: recent(18), destination: unavailable("SIM-GEO-44"), sourceSubtype: "RESTRICTED_ENTRY",
  },
  {
    id: "SIM-INC-HIGH-1043", category: "ALT-08", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "High-severity incident needs attention", ar: "حادث عالي الخطورة يحتاج متابعة" },
    description: {
      en: "A HIGH incident is currently OPEN at this location.",
      ar: "توجد حالة بخطورة عالية وحالتها مفتوحة في هذا الموقع.",
    },
    location: downtown, time: null, destination: unavailable("SIM-INC-HIGH-1043"),
    sourceSeverity: "HIGH", sourceStatus: "OPEN",
  },
  {
    id: "SIM-PAY-88", category: "ALT-10", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Payment collection failed", ar: "فشل تحصيل الدفعة" },
    description: {
      en: "This payment has a confirmed failed collection outcome.",
      ar: "تم تأكيد فشل تحصيل هذه الدفعة من المصدر المعتمد.",
    },
    location: west, time: null, destination: unavailable("SIM-PAY-88"),
  },
  {
    id: "SIM-STAFF-41", category: "ALT-15", kind: "OCCURRENCE", severity: "IMPORTANT",
    title: { en: "Staff location access revoked", ar: "إلغاء وصول موظف إلى موقع" },
    description: {
      en: "A committed staff access-revocation event requires company review.",
      ar: "حدث موثق لسحب صلاحية موقع بحاجة لمراجعة الشركة.",
    },
    location: null, time: recent(21), destination: unavailable("SIM-STAFF-41"),
    sourceSubtype: "LOCATION_ACCESS_REVOKED",
  },
  {
    id: "SIM-STAGE-18", category: "ALT-04", kind: "ACTIVE", severity: "IMPORTANT",
    title: { en: "Retrieval stage delayed", ar: "تأخر مرحلة الاسترجاع" },
    description: {
      en: "A current accepted task stage exceeded its configured delay.",
      ar: "تجاوزت مرحلة مهمة مقبولة المدة المحددة دون تقدم.",
    },
    location: west, time: null, destination: unavailable("SIM-STAGE-18"),
  },
];
