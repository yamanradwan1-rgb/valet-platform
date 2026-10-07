import { vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";
import { emptyCheckInContinuation } from "@valet/employee-client";

export function base(
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active: null,
    continuation: emptyCheckInContinuation(),
    customerPhone: "790001234",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase: "capture",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
    ...patch,
  };
}

export const savedCustomer = {
  customerId: "customer-id",
  displayName: "A. Customer",
  phoneSuffix: "0097",
} as const;

export const recognized = {
  color: "أسود",
  make: "Toyota",
  model: "كامري",
  plateCountry: "JO",
  plateNumberNormalized: "1234567",
  plateNumberRaw: "A12-34B",
  returningCustomer: savedCustomer,
  vehicleId: "vehicle-id",
  vehicleUpdatedAt: "date",
} as const;

const active = {
  conditionCompletedAt: "date",
  sessionId: "session-id",
  state: "AWAITING_PARKING" as const,
  vehicle: {
    color: "أسود",
    make: "Toyota",
    model: "كامري",
    plateCountry: "JO",
    plateNumberRaw: "A12-34B",
    temporaryDescriptor: null,
    vehicleId: "vehicle-id",
    vehicleUpdatedAt: "date",
  },
  version: 2,
};

export function controller() {
  return {
    chooseDifferentCustomer: vi.fn(),
    confirmIdentity: vi.fn(),
    continueWithoutRecognition: vi.fn(),
    editIdentity: vi.fn(),
    recoverAmbiguous: vi.fn(),
    resume: vi.fn(),
    retryDiscovery: vi.fn(),
    retryIntake: vi.fn(),
    reviewIdentity: vi.fn(),
    setCustomerPhone: vi.fn(),
    setVehicle: vi.fn(),
    submitCustomer: vi.fn(),
    useSavedCustomer: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

interface MatrixCase {
  readonly name: string;
  readonly state: EmployeeCheckInSnapshot;
  readonly en: readonly [title: string, probe: string];
  readonly ar: readonly [title: string, probe: string];
}

const descriptor = {
  mode: "TEMPORARY_DESCRIPTOR" as const,
  plateCountry: "JO",
  plateNumberRaw: "",
  temporaryDescriptor: "تويوتا فضية",
};

export const localeStateCases: MatrixCase[] = [
  {
    name: "discovering",
    state: base({ phase: "discovering" }),
    en: ["", "Checking for existing check-in drafts..."],
    ar: ["", "جارٍ التحقق من عمليات التسجيل غير المكتملة..."],
  },
  {
    name: "discovery error",
    state: base({
      phase: "discovery-error",
      error: { code: "SERVICE_UNAVAILABLE", message: "private" },
    }),
    en: ["Check-In Discovery", "Retry Discovery"],
    ar: ["استعادة تسجيل الدخول", "إعادة محاولة الاستعادة"],
  },
  {
    name: "recoverables",
    state: base({ phase: "recoverables" }),
    en: ["Recoverable Sessions", "Multiple Incomplete Check-Ins Found"],
    ar: ["الجلسات القابلة للاستئناف", "تم العثور على عدة عمليات غير مكتملة"],
  },
  {
    name: "camera idle",
    state: base({ vehicle: { ...base().vehicle, plateNumberRaw: "" } }),
    en: ["Scan Plate", "Scan Plate"],
    ar: ["مسح اللوحة", "مسح اللوحة"],
  },
  {
    name: "manual plate",
    state: base(),
    en: ["Enter Plate", "License Plate"],
    ar: ["إدخال اللوحة", "لوحة المركبة"],
  },
  {
    name: "descriptor",
    state: base({ vehicle: descriptor }),
    en: ["Temporary Descriptor", "Vehicle description"],
    ar: ["وصف مؤقت", "وصف المركبة"],
  },
  {
    name: "confirm plate",
    state: base({ phase: "confirm" }),
    en: ["Confirm Plate", "Confirm Plate"],
    ar: ["تأكيد اللوحة", "تأكيد اللوحة"],
  },
  {
    name: "confirm descriptor",
    state: base({ phase: "confirm", vehicle: descriptor }),
    en: ["Confirm", "Confirm"],
    ar: ["تأكيد", "تأكيد"],
  },
  {
    name: "recognizing",
    state: base({ phase: "recognizing" }),
    en: ["Vehicle found", "Checking for existing check-in drafts..."],
    ar: [
      "تم العثور على المركبة",
      "جارٍ التحقق من عمليات التسجيل غير المكتملة...",
    ],
  },
  {
    name: "returning saved",
    state: base({ phase: "returning", recognizedVehicle: recognized }),
    en: ["Vehicle found", "Use saved customer"],
    ar: ["تم العثور على المركبة", "استخدام العميل المحفوظ"],
  },
  {
    name: "returning no saved",
    state: base({
      phase: "returning",
      recognizedVehicle: { ...recognized, returningCustomer: null },
    }),
    en: ["Vehicle found", "Continue to customer"],
    ar: ["تم العثور على المركبة", "متابعة لإدخال رقم العميل"],
  },
  {
    name: "customer recognized",
    state: base({ phase: "customer", recognizedVehicle: recognized }),
    en: ["Customer Contact", "Mobile Number"],
    ar: ["بيانات تواصل العميل", "رقم الهاتف المحمول"],
  },
  {
    name: "customer new plate",
    state: base({ phase: "customer" }),
    en: ["Customer Contact", "New Vehicle"],
    ar: ["بيانات تواصل العميل", "مركبة جديدة"],
  },
  {
    name: "customer descriptor",
    state: base({ phase: "customer", vehicle: descriptor }),
    en: ["Customer Contact", "تويوتا فضية"],
    ar: ["بيانات تواصل العميل", "تويوتا فضية"],
  },
  {
    name: "submitting recognized",
    state: base({ phase: "submitting", recognizedVehicle: recognized }),
    en: ["Creating Intake...", "Creating Intake..."],
    ar: ["جارٍ إنشاء سجل الوصول...", "جارٍ إنشاء سجل الوصول..."],
  },
  {
    name: "submitting new plate",
    state: base({ phase: "submitting" }),
    en: ["Creating Intake...", "New Vehicle"],
    ar: ["جارٍ إنشاء سجل الوصول...", "مركبة جديدة"],
  },
  {
    name: "submitting descriptor",
    state: base({ phase: "submitting", vehicle: descriptor }),
    en: ["Creating Intake...", "New Vehicle"],
    ar: ["جارٍ إنشاء سجل الوصول...", "مركبة جديدة"],
  },
  {
    name: "phone ambiguous",
    state: base({
      phase: "customer",
      error: { code: "CUSTOMER_PHONE_AMBIGUOUS", message: "private" },
    }),
    en: ["Customer Contact", "The operation failed. Refresh and try again."],
    ar: [
      "بيانات تواصل العميل",
      "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    ],
  },
  {
    name: "saved customer stale",
    state: base({
      phase: "customer",
      error: { code: "RETURNING_CUSTOMER_INTENT_INVALID", message: "private" },
    }),
    en: ["Customer Contact", "The operation failed. Refresh and try again."],
    ar: [
      "بيانات تواصل العميل",
      "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    ],
  },
  {
    name: "ambiguous initial",
    state: base({
      phase: "intake-ambiguous",
      error: { code: "REQUEST_TIMEOUT", message: "private" },
    }),
    en: ["Connection issue", "Retry"],
    ar: ["مشكلة في الاتصال", "إعادة المحاولة"],
  },
  {
    name: "ambiguous checking",
    state: base({ phase: "intake-ambiguous" }),
    en: ["Connection issue", "Retry"],
    ar: ["مشكلة في الاتصال", "إعادة المحاولة"],
  },
  {
    name: "ambiguous retry",
    state: base({ phase: "intake-ambiguous", recoveryChecked: true }),
    en: ["Connection issue", "Retry Discovery"],
    ar: ["مشكلة في الاتصال", "إعادة محاولة الاستعادة"],
  },
  {
    name: "created",
    state: base({ active, phase: "created" }),
    en: ["Vehicle details", "Correct vehicle details"],
    ar: ["تفاصيل المركبة", "تصحيح بيانات المركبة"],
  },
  {
    name: "continuation",
    state: base({ active, phase: "continuation" }),
    en: ["Parking Task", "Foreground location tracking may run only"],
    ar: ["مهمة الإيقاف", "قد يعمل تتبّع الموقع في الواجهة الأمامية فقط"],
  },
];
