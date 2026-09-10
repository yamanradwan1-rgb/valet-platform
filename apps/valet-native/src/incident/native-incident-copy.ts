import type {
  EmployeeLocale,
  IncidentSeverity,
  IncidentType,
} from "@valet/employee-client";

interface NativeIncidentCopy {
  readonly back: string;
  readonly cannotEstablishSession: string;
  readonly describeIncident: string;
  readonly failure: string;
  readonly incidentOpened: string;
  readonly loadingSession: string;
  readonly openIncident: string;
  readonly opening: string;
  readonly reference: string;
  readonly reportIncident: string;
  readonly retry: string;
  readonly returnLabel: string;
  readonly selectType: string;
  readonly sessionContextError: string;
  readonly sessionLabel: string;
  readonly severityLabel: string;
  readonly typeLabel: string;
  readonly vehicle: string;
  readonly types: Readonly<Record<IncidentType, string>>;
  readonly severities: Readonly<Record<IncidentSeverity, string>>;
}

const copy: Record<EmployeeLocale, NativeIncidentCopy> = {
  en: {
    back: "Back",
    cannotEstablishSession: "Cannot establish session context",
    describeIncident: "Briefly describe what happened...",
    failure: "The operation failed. Refresh and try again.",
    incidentOpened: "Incident opened",
    loadingSession: "Loading session context…",
    openIncident: "Open Incident",
    opening: "Opening…",
    reference: "Reference",
    reportIncident: "Report Incident",
    retry: "Retry",
    returnLabel: "Return",
    selectType: "Select type",
    sessionContextError:
      "The authoritative vehicle/session context could not be loaded.",
    sessionLabel: "Session",
    severityLabel: "Severity",
    typeLabel: "Type",
    vehicle: "Vehicle",
    types: {
      CUSTOMER_COMPLAINT: "Customer complaint",
      EMPLOYEE_SAFETY: "Employee safety",
      KEY_DAMAGED: "Key damaged",
      KEY_LOCKED_INSIDE: "Key locked inside",
      KEY_MISSING: "Key missing",
      OTHER: "Other",
      PAYMENT_DISPUTE: "Payment dispute",
      SYSTEM_CONNECTION: "System / connection",
      UNAUTHORIZED_ZONE_EXIT: "Unauthorized zone exit",
      VEHICLE_DAMAGE: "Vehicle damage",
      WRONG_KEY: "Wrong key",
      WRONG_VEHICLE_HANDOFF_ATTEMPT: "Wrong vehicle handoff attempt",
    },
    severities: {
      CRITICAL: "Critical",
      HIGH: "High",
      LOW: "Low",
      MEDIUM: "Medium",
    },
  },
  ar: {
    back: "رجوع",
    cannotEstablishSession: "تعذر إنشاء سياق الجلسة",
    describeIncident: "صف بإيجاز ما حدث...",
    failure: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    incidentOpened: "تم فتح الحادث",
    loadingSession: "جارٍ تحميل سياق الجلسة…",
    openIncident: "فتح الحادث",
    opening: "جارٍ الفتح…",
    reference: "المرجع",
    reportIncident: "الإبلاغ عن حادث",
    retry: "إعادة المحاولة",
    returnLabel: "رجوع",
    selectType: "نوع الحادث",
    sessionContextError: "تعذر تحميل سياق المركبة والجلسة المعتمد.",
    sessionLabel: "الجلسة",
    severityLabel: "الأهمية",
    typeLabel: "النوع",
    vehicle: "المركبة",
    types: {
      CUSTOMER_COMPLAINT: "شكوى عميل",
      EMPLOYEE_SAFETY: "سلامة الموظف",
      KEY_DAMAGED: "المفتاح تالف",
      KEY_LOCKED_INSIDE: "المفتاح داخل المركبة",
      KEY_MISSING: "المفتاح مفقود",
      OTHER: "أخرى",
      PAYMENT_DISPUTE: "نزاع دفع",
      SYSTEM_CONNECTION: "النظام / الاتصال",
      UNAUTHORIZED_ZONE_EXIT: "خروج غير مصرح من المنطقة",
      VEHICLE_DAMAGE: "ضرر بالمركبة",
      WRONG_KEY: "مفتاح خاطئ",
      WRONG_VEHICLE_HANDOFF_ATTEMPT: "محاولة تسليم مركبة خاطئة",
    },
    severities: {
      CRITICAL: "حرجة",
      HIGH: "عالية",
      LOW: "منخفضة",
      MEDIUM: "متوسطة",
    },
  },
};

export function getNativeIncidentCopy(
  locale: EmployeeLocale,
): NativeIncidentCopy {
  return copy[locale];
}

export function presentNativeIncidentFailure(
  locale: EmployeeLocale,
  safeEnglishMessage: string,
): string {
  return locale === "ar" ? copy.ar.failure : safeEnglishMessage;
}
