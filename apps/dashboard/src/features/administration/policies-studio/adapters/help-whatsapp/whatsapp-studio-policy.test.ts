import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import type { WhatsAppSettingsView } from "../../../settings/whatsapp-settings-api";
import {
  assertWhatsAppStudioScope,
  readScopedWhatsAppStudio,
  saveScopedWhatsAppStudio,
  whatsappStudioDirty,
  whatsappStudioFieldValue,
} from "./whatsapp-studio-policy";

const companyPolicy = {
  enabled: false,
  language: "ar" as const,
  templateCatalogVersion: "guest_link_v1",
  providerBindingId: null,
  revision: 5,
};

const locationView: WhatsAppSettingsView = {
  organizationId: "company-one",
  locationId: "location-one",
  policy: {
    enabled: null,
    language: "en",
    templateCatalogVersion: null,
    providerBindingId: null,
    revision: 3,
  },
  companyDefault: companyPolicy,
  approvedTemplateVersions: ["guest_link_v1"],
  connections: [],
  activationReady: false,
  globalSendEnabled: false,
};

function apiWith(result: WhatsAppSettingsView) {
  const request = vi.fn().mockResolvedValue(result);
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("Policies Studio WhatsApp scope and persistence adapter", () => {
  it("resolves actual location inheritance, including explicit false", () => {
    expect(whatsappStudioFieldValue(locationView, "waEnabled")).toEqual({
      saved: null,
      effective: false,
      source: "inherited",
    });
    expect(whatsappStudioFieldValue(locationView, "waLanguage")).toEqual({
      saved: "en",
      effective: "en",
      source: "override",
    });
    const explicitFalse = {
      ...locationView,
      policy: { ...locationView.policy, enabled: false },
    };
    expect(whatsappStudioFieldValue(explicitFalse, "waEnabled").source).toBe(
      "override",
    );
    expect(
      whatsappStudioFieldValue(
        {
          ...locationView,
          locationId: null,
          companyDefault: null,
          policy: companyPolicy,
        },
        "waTemplate",
      ).source,
    ).toBe("default");
  });

  it("tracks edits to the four policy values without treating revision as a draft", () => {
    expect(
      whatsappStudioDirty(companyPolicy, { ...companyPolicy, revision: 6 }),
    ).toBe(false);
    expect(
      whatsappStudioDirty(companyPolicy, { ...companyPolicy, enabled: true }),
    ).toBe(true);
    expect(whatsappStudioDirty(null, companyPolicy)).toBe(false);
  });

  it("rejects foreign organization or location responses without exposing them", async () => {
    const { api, request } = apiWith(locationView);
    await expect(
      readScopedWhatsAppStudio(api, "company-two", "location-one"),
    ).rejects.toThrow("WHATSAPP_SCOPE_MISMATCH");
    expect(request).toHaveBeenCalledTimes(1);
    await expect(
      readScopedWhatsAppStudio(api, "company-one", "location-two"),
    ).rejects.toThrow("WHATSAPP_SCOPE_MISMATCH");
    expect(() =>
      assertWhatsAppStudioScope(locationView, "company-one", null),
    ).toThrow("WHATSAPP_SCOPE_MISMATCH");
  });

  it("reads only exact scoped management API and preserves AbortSignal", async () => {
    const { api, request } = apiWith(locationView);
    const controller = new AbortController();
    expect(
      await readScopedWhatsAppStudio(
        api,
        "company-one",
        "location-one",
        controller.signal,
      ),
    ).toBe(locationView);
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/management/organizations/company-one/locations/location-one/whatsapp-settings",
      expect.any(Object),
      { signal: controller.signal },
    );
  });

  it("saves one bundled revision-guarded policy, never invokes any sender endpoint", async () => {
    const updated = {
      ...locationView,
      policy: { ...locationView.policy, enabled: false, revision: 4 },
    };
    const { api, request } = apiWith(updated);
    const draft = { ...locationView.policy, enabled: false, revision: 999 };
    expect(
      await saveScopedWhatsAppStudio(
        api,
        "company-one",
        "location-one",
        locationView,
        draft,
      ),
    ).toBe(updated);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/management/organizations/company-one/locations/location-one/whatsapp-settings",
      expect.any(Object),
      { method: "PUT", body: { ...draft, revision: 3, expectedRevision: 3 } },
    );
  });

  it("rejects a stale or foreign authoritative view before any mutation", async () => {
    const { api, request } = apiWith(locationView);
    await expect(
      saveScopedWhatsAppStudio(
        api,
        "company-other",
        "location-one",
        locationView,
        locationView.policy,
      ),
    ).rejects.toThrow("WHATSAPP_SCOPE_MISMATCH");
    expect(request).not.toHaveBeenCalled();
  });
});
