import type { ManagementSettingKey } from "@valet/contracts";
import type { ContextHelpKey } from "./context-help-registry";
import type { Field } from "../administration/settings/shift-presence-policy-fields";

export type OrdinarySettingKey = Exclude<ManagementSettingKey, "operatingHours">;

// This mapping intentionally exhausts the shared typed settings contract.
// A new setting fails typecheck here until it receives dedicated copy.
export const ordinarySettingHelpKeys = {
  checkInPhotosRequired: "setting.checkInPhotosRequired",
  handoffStandardMethodPolicy: "setting.handoffStandardMethodPolicy",
  trackingEnabled: "setting.trackingEnabled",
  rawGpsRetentionDays: "setting.rawGpsRetentionDays",
  valetServiceFee: "setting.valetServiceFee",
  paymentServicePayer: "setting.paymentServicePayer",
  paymentMethodsPolicy: "setting.paymentMethodsPolicy",
  tipsEnabled: "setting.tipsEnabled",
  validationEnabled: "setting.validationEnabled",
  releaseRequiresPayment: "setting.releaseRequiresPayment",
  languageDefault: "setting.languageDefault",
  ocrAssistEnabled: "setting.ocrAssistEnabled",
  parkingSpotRequired: "setting.parkingSpotRequired",
  employeeRetrievalRequestedNotificationEnabled: "setting.employeeRetrievalRequestedNotificationEnabled",
  guestVehicleReadyNotificationEnabled: "setting.guestVehicleReadyNotificationEnabled",
} as const satisfies Record<OrdinarySettingKey, ContextHelpKey>;

export const presencePolicyHelpKeys = {
  shiftStartPresenceMode: "presence.shiftStartPresenceMode",
  shiftEndPresenceMode: "presence.shiftEndPresenceMode",
  shiftPresenceMaxAccuracyMeters: "presence.shiftPresenceMaxAccuracyMeters",
  shiftPresenceMaxFixAgeSeconds: "presence.shiftPresenceMaxFixAgeSeconds",
} as const satisfies Record<Field["field"], ContextHelpKey>;

// Every listed non-ordinary control is a dedicated current UI surface.
export const additionalHelpKeys = [
  "setting.operatingHours",
  "setting.slaTargetSeconds",
  "policies.presence",
  "presence.readiness",
  "presence.zones",
  "presence.zoneForm",
  "presence.exceptions",
  "presence.review",
] as const satisfies readonly ContextHelpKey[];

export const specialSettingsHelpKeys = [
  ...Object.values(presencePolicyHelpKeys),
  ...additionalHelpKeys,
] as const satisfies readonly ContextHelpKey[];
