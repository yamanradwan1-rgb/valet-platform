import { E2E_IDS, LOCATION_A, ORG_A } from "./dashboard-api-fixture";

export const SETTINGS_UPDATED_AT = "2026-09-21T08:00:00.000Z";

const defaultSettings = {
  checkInPhotosRequired: false,
  handoffStandardMethodPolicy: "EITHER",
  trackingEnabled: true,
  rawGpsRetentionDays: 30,
  valetServiceFee: "5.500",
  paymentServicePayer: "CUSTOMER",
  paymentMethodsPolicy: "CASH_OR_DIGITAL",
  tipsEnabled: true,
  validationEnabled: true,
  releaseRequiresPayment: true,
  languageDefault: "EN",
  operatingHours: null,
  ocrAssistEnabled: true,
  parkingSpotRequired: true,
  employeeRetrievalRequestedNotificationEnabled: true,
  guestVehicleReadyNotificationEnabled: true,
} as const;

export function companySettings(updatedAt = SETTINGS_UPDATED_AT) {
  return {
    organizationId: ORG_A.organizationId,
    updatedAt,
    defaults: { ...defaultSettings },
  };
}

function inherited<T>(value: T) {
  return {
    default: value,
    overridePresent: false,
    override: null,
    effective: value,
  };
}

export function managementLocationSettings(updatedAt = SETTINGS_UPDATED_AT) {
  return {
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    timezone: LOCATION_A.timezone,
    currency: LOCATION_A.currency,
    updatedAt,
    settings: {
      checkInPhotosRequired: inherited(defaultSettings.checkInPhotosRequired),
      handoffStandardMethodPolicy: inherited(
        defaultSettings.handoffStandardMethodPolicy,
      ),
      trackingEnabled: inherited(defaultSettings.trackingEnabled),
      rawGpsRetentionDays: inherited(defaultSettings.rawGpsRetentionDays),
      valetServiceFee: inherited(defaultSettings.valetServiceFee),
      paymentServicePayer: inherited(defaultSettings.paymentServicePayer),
      paymentMethodsPolicy: inherited(defaultSettings.paymentMethodsPolicy),
      tipsEnabled: inherited(defaultSettings.tipsEnabled),
      validationEnabled: inherited(defaultSettings.validationEnabled),
      releaseRequiresPayment: inherited(defaultSettings.releaseRequiresPayment),
      languageDefault: inherited(defaultSettings.languageDefault),
      operatingHours: inherited(defaultSettings.operatingHours),
      ocrAssistEnabled: inherited(defaultSettings.ocrAssistEnabled),
      parkingSpotRequired: inherited(defaultSettings.parkingSpotRequired),
      employeeRetrievalRequestedNotificationEnabled: inherited(
        defaultSettings.employeeRetrievalRequestedNotificationEnabled,
      ),
      guestVehicleReadyNotificationEnabled: inherited(
        defaultSettings.guestVehicleReadyNotificationEnabled,
      ),
      slaTargetSeconds: null,
    },
  };
}

export function locationManagerConfiguration(updatedAt = SETTINGS_UPDATED_AT) {
  return {
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    timezone: LOCATION_A.timezone,
    currency: LOCATION_A.currency,
    updatedAt,
    settings: [
      {
        setting: "rawGpsRetentionDays",
        default: 30,
        overridePresent: false,
        override: null,
        effective: 30,
      },
      {
        setting: "valetServiceFee",
        default: "5.500",
        overridePresent: false,
        override: null,
        effective: "5.500",
      },
    ],
  };
}

export function staffDirectoryItem(
  email = "worker@example.com",
  membershipId = E2E_IDS.membership,
) {
  return {
    identity: { firstName: null, lastName: null, email },
    locationAccessCount: 0,
    membershipId,
    role: "VALET_EMPLOYEE" as const,
    status: "ACTIVE" as const,
    version: 1,
  };
}

export function integrationsProjection(organizationId = ORG_A.organizationId) {
  return {
    organizationId,
    integrations: [
      { key: "PLATE_OCR", status: "UNKNOWN" },
      { key: "STAFF_PUSH", status: "DEGRADED" },
      { key: "DIGITAL_PAYMENT", status: "OPERATIONAL" },
    ],
  } as const;
}
