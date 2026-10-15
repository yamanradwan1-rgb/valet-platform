import { describe, expect, it } from "vitest";
import {
  whatsappSettingsPath, whatsappSettingsSchema, type WhatsAppSettingsView,
} from "./whatsapp-settings-api";

const state: WhatsAppSettingsView = {
  organizationId: "org-1",
  locationId: null,
  globalSendEnabled: false,
  activationReady: false,
  approvedTemplateVersions: [],
  companyDefault: null,
  policy: { enabled: false, language: "ar", templateCatalogVersion: null,
    providerBindingId: null, revision: 1 },
  connections: [],
};

describe("company-scoped WhatsApp settings transport", () => {
  it("uses management Organization/Location paths, never a shared sender path", () => {
    expect(whatsappSettingsPath("org-1", null))
      .toBe("/v1/staff/management/organizations/org-1/whatsapp-settings");
    expect(whatsappSettingsPath("org-1", "location-1"))
      .toBe("/v1/staff/management/organizations/org-1/locations/location-1/whatsapp-settings");
  });

  it("requires truthful explicit activation and connection status", () => {
    expect(whatsappSettingsSchema.safeParse(state).success).toBe(true);
    expect(whatsappSettingsSchema.safeParse({ ...state, activationReady: true }).success)
      .toBe(false);
    expect(whatsappSettingsSchema.safeParse({ ...state, connections: [{
      id: "id", phoneNumberId: "ph", wabaId: "wa", status: "CONNECTED",
    }] }).success).toBe(false);
  });

  it("rejects malicious/invalid cross-scope and changed API shape", () => {
    expect(whatsappSettingsSchema.safeParse({ ...state, locationId: {} }).success)
      .toBe(false);
    expect(whatsappSettingsSchema.safeParse({ ...state, policy: {
      ...state.policy, revision: "1",
    } }).success).toBe(false);
    expect(whatsappSettingsSchema.safeParse({ ...state, approvedTemplateVersions: [1] }).success)
      .toBe(false);
  });
});
