import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../../lib/api/dashboard-api-error";
import { executeSensitiveMutation } from "../../../sensitive-mutation-executor";
import type { WhatsAppSettingsView } from "../../../settings/whatsapp-settings-api";
import {
  assertWhatsAppStudioScope,
  readScopedWhatsAppStudio,
  saveScopedWhatsAppStudio,
  saveSensitiveScopedWhatsAppStudio,
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

  it.each([
    ["MFA step-up", "MFA_REQUIRED", "mfa", 403],
    ["CAS conflict", "CONFLICT", "conflict", 409],
  ] as const)(
    "does not report %s as a saved policy or replay the bundled PUT",
    async (_label, code, kind, status) => {
      const { api, request } = apiWith(locationView);
      const reason = new DashboardApiError({
        code,
        kind,
        status,
        message: "authorization or revision challenge",
      });
      request.mockRejectedValueOnce(reason);
      const onMfaRequired = vi.fn();
      const onConflict = vi.fn();
      const onError = vi.fn();
      const run = vi.fn(async (operation, onSuccess) => {
        await executeSensitiveMutation(operation, {
          isCurrent: () => true,
          onMfaRequired,
          onConflict,
          onError,
          onSuccess,
        });
      });

      const confirmed = await saveSensitiveScopedWhatsAppStudio(
        run,
        api,
        "company-one",
        "location-one",
        locationView,
        { ...locationView.policy, enabled: true, revision: 999 },
      );

      expect(confirmed).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ revision: 3, expectedRevision: 3 }),
        }),
      );
      expect(onMfaRequired).toHaveBeenCalledTimes(kind === "mfa" ? 1 : 0);
      expect(onConflict).toHaveBeenCalledTimes(kind === "conflict" ? 1 : 0);
    },
  );

  it("confirms success only while the sensitive scope is current", async () => {
    const { api, request } = apiWith(locationView);
    let current = true;
    request.mockImplementationOnce(async () => {
      current = false;
      return locationView;
    });
    const run = async (
      operation: () => Promise<WhatsAppSettingsView>,
      onSuccess: (result: WhatsAppSettingsView) => void,
    ) =>
      executeSensitiveMutation(operation, {
        isCurrent: () => current,
        onMfaRequired: vi.fn(),
        onError: vi.fn(),
        onSuccess,
      });

    expect(
      await saveSensitiveScopedWhatsAppStudio(
        run,
        api,
        "company-one",
        "location-one",
        locationView,
        { ...locationView.policy, enabled: true },
      ),
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("confirms exactly one successful sensitive bundled policy write", async () => {
    const saved = {
      ...locationView,
      policy: { ...locationView.policy, enabled: true, revision: 4 },
    };
    const { api, request } = apiWith(saved);
    const run = async (
      operation: () => Promise<WhatsAppSettingsView>,
      onSuccess: (result: WhatsAppSettingsView) => void,
    ) =>
      executeSensitiveMutation(operation, {
        isCurrent: () => true,
        onMfaRequired: vi.fn(),
        onError: vi.fn(),
        onSuccess,
      });

    expect(
      await saveSensitiveScopedWhatsAppStudio(
        run,
        api,
        "company-one",
        "location-one",
        locationView,
        { ...locationView.policy, enabled: true },
      ),
    ).toEqual(saved);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
