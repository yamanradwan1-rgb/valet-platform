import type { Scalar } from "./catalog";

export const fixtureDefaults: Record<string, Scalar> = {
  checkInPhotosRequired: false,
  handoffStandardMethodPolicy: "EITHER",
  trackingEnabled: false,
  rawGpsRetentionDays: 30,
  valetServiceFee: "5.000",
  paymentServicePayer: "CUSTOMER",
  paymentMethodsPolicy: "CASH_OR_DIGITAL",
  tipsEnabled: true,
  validationEnabled: true,
  releaseRequiresPayment: true,
  languageDefault: "AR",
  ocrAssistEnabled: false,
  parkingSpotRequired: true,
  employeeRetrievalRequestedNotificationEnabled: true,
  guestVehicleReadyNotificationEnabled: false,
  shiftStartPresenceMode: "OFF",
  shiftEndPresenceMode: "OFF",
  shiftPresenceMaxAccuracyMeters: 50,
  shiftPresenceMaxFixAgeSeconds: 30,
  waEnabled: false,
  waLanguage: "ar",
  waTemplate: "",
  waBinding: "",
};
export const organizations = [
  { id: "demo-hospitality", en: "Demo Hospitality", ar: "الضيافة التجريبية" },
  { id: "demo-valet", en: "Demo Valet Company", ar: "شركة الصف التجريبية" },
];
export const locations = [
  {
    id: "garden",
    en: "Garden Hotel · Demo",
    ar: "فندق الحديقة · تجريبي",
    currency: "JOD",
    timezone: "Asia/Amman",
  },
  {
    id: "marina",
    en: "Marina Venue · Demo",
    ar: "منشأة المرسى · تجريبي",
    currency: "JOD",
    timezone: "Asia/Amman",
  },
];
export interface Day {
  weekday: string;
  status: "OPEN" | "CLOSED";
  opensAt?: string;
  closesAt?: string;
}
export const fixtureHours: Day[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
].map((weekday) => ({
  weekday,
  status: "OPEN",
  opensAt: "08:00",
  closesAt: "23:00",
}));
export interface Zone {
  id: string;
  code: string;
  label: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: "ACTIVE" | "DISABLED";
}
export const fixtureZones: Zone[] = [
  {
    id: "demo-zone-1",
    code: "ARRIVAL",
    label: "Demo arrival court",
    latitude: 31.95,
    longitude: 35.91,
    radius: 80,
    status: "ACTIVE",
  },
];
export interface LocalStore {
  settings: Record<string, Record<string, Scalar>>;
  schedules: Record<string, Day[] | null>;
  zones: Record<string, Zone[]>;
}
export const STORAGE_KEY = "vaylet-321-studio-v1";
export function loadStore(): LocalStore {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (value && value.settings && value.schedules && value.zones) return value;
  } catch {
    /* Corrupt local demonstration state falls back to synthetic fixtures. */
  }
  return { settings: {}, schedules: {}, zones: {} };
}
export function companyKey(org: string) {
  return `${org}:company`;
}
export function locationKey(org: string, location: string) {
  return `${org}:location:${location}`;
}
export function defaultValues(store: LocalStore, org: string) {
  return { ...fixtureDefaults, ...store.settings[companyKey(org)] };
}
export function savedOverrides(
  store: LocalStore,
  org: string,
  location: string,
) {
  const seeded =
    location === "garden"
      ? { handoffStandardMethodPolicy: "PICKUP_CODE", slaTargetSeconds: 240 }
      : { slaTargetSeconds: 360 };
  return { ...seeded, ...store.settings[locationKey(org, location)] } as Record<
    string,
    Scalar
  >;
}
