import {
  ordinarySettings,
  type FixtureRole,
  type FixtureValue,
} from "./settings-catalog";

/**
 * MANDATORY visible caption beside any sample-derived value or status.
 * Values below are fabricated for interaction demonstrations, not read from
 * VAYLET's API, production tenants, seeds, or actual customer configuration.
 */
export const fixtureNotice = {
  en: "INTERACTIVE PROTOTYPE · Simulated settings · No real save or message delivery",
  ar: "نموذج تفاعلي · إعدادات تجريبية · دون حفظ فعلي أو إرسال رسائل",
} as const;
export const fixtureProvenance = {
  kind: "SYNTHETIC_PROTOTYPE_ONLY",
  sourceSha: "20998a069eb5d576895c0e6c149271a4a0e4028b",
  source: "Production key/schema/label definitions only; sample values are invented and explicitly labeled.",
  noBackendCalls: true,
  noCustomerData: true,
  noDelivery: true,
} as const;

/** Valid-looking examples for UX; not the real product's seeded defaults. */
export const sampleCompanyDefaults: Readonly<Record<string, FixtureValue>> = {
  checkInPhotosRequired: false,
  handoffStandardMethodPolicy: "EITHER",
  trackingEnabled: false,
  rawGpsRetentionDays: 7,
  valetServiceFee: "0.000",
  paymentServicePayer: "CUSTOMER",
  paymentMethodsPolicy: "CASH_OR_DIGITAL",
  tipsEnabled: false,
  validationEnabled: false,
  releaseRequiresPayment: false,
  languageDefault: "AR",
  ocrAssistEnabled: false,
  parkingSpotRequired: false,
  employeeRetrievalRequestedNotificationEnabled: false,
  guestVehicleReadyNotificationEnabled: false,
  operatingHours: null,
} as const;

/** Explicit false proves CUSTOM false is distinct from INHERIT/null. */
export const sampleLocationOverrides: Readonly<Partial<Record<string, FixtureValue>>> = {
  handoffStandardMethodPolicy: "PICKUP_CODE",
  trackingEnabled: false,
  rawGpsRetentionDays: 3,
};

export const sampleLocationProjection = ordinarySettings.map((field) => {
  const defaultValue = sampleCompanyDefaults[field.key];
  const overridePresent = Object.prototype.hasOwnProperty.call(
    sampleLocationOverrides, field.key,
  );
  const override = overridePresent
    ? (sampleLocationOverrides[field.key] ?? null)
    : null;
  return {
    key: field.key,
    default: defaultValue,
    overridePresent,
    override,
    effective: overridePresent ? override : defaultValue,
  };
});

export const sampleSpecialProjection = {
  operatingHours: {
    default: null,
    overridePresent: false,
    override: null,
    effective: null,
  },
  slaTargetSeconds: null, // Location-only, no Company default
} as const;

export const samplePresence = {
  company: {
    shiftStartPresenceMode: "OFF",
    shiftEndPresenceMode: "OFF",
    shiftPresenceMaxAccuracyMeters: 50,
    shiftPresenceMaxFixAgeSeconds: 30,
  },
  locationOverrides: {
    shiftStartPresenceMode: null,
    shiftEndPresenceMode: null,
    shiftPresenceMaxAccuracyMeters: null,
    shiftPresenceMaxFixAgeSeconds: null,
  },
  zones: null, // Intentionally unknown; never invent active zones/counts
  exceptions: null, // Intentionally unknown; never invent employee/approval facts
  readiness: null, // Must be server-derived in real product
} as const;

export const sampleWhatsApp = {
  policy: {
    enabled: false,
    language: "ar",
    templateCatalogVersion: null,
    providerBindingId: null,
  },
  locationOverride: {
    enabled: null,
    language: null,
    templateCatalogVersion: null,
    providerBindingId: null,
  },
  approvedTemplateVersions: [] as readonly string[],
  connections: [] as readonly never[],
  globalSendEnabled: false,
  activationReady: false,
} as const;

export const sampleServices = [
  { key: "PLATE_OCR", status: null },
  { key: "STAFF_PUSH", status: null },
  { key: "DIGITAL_PAYMENT", status: null },
] as const; // null = not queried, never invent a real provider status

export interface FixtureScenario {
  readonly id: string;
  readonly role: FixtureRole;
  readonly hasLocation: boolean;
  readonly label: Readonly<{ en: string; ar: string }>;
}

export const scenarios: readonly FixtureScenario[] = [
  {
    id: "company-with-location",
    role: "COMPANY_ADMIN",
    hasLocation: true,
    label: { en: "Company Admin · Sample Location", ar: "مدير الشركة · موقع تجريبي" },
  },
  {
    id: "company-no-location",
    role: "COMPANY_ADMIN",
    hasLocation: false,
    label: { en: "Company Admin · No location selected", ar: "مدير الشركة · لا يوجد موقع محدد" },
  },
  {
    id: "location-manager",
    role: "LOCATION_MANAGER",
    hasLocation: true,
    label: { en: "Location Manager · Authorized sample location", ar: "مدير الموقع · موقع تجريبي مصرح" },
  },
  {
    id: "denied",
    role: "DENIED",
    hasLocation: false,
    label: { en: "No Policies permission", ar: "لا توجد صلاحية للسياسات" },
  },
] as const;
