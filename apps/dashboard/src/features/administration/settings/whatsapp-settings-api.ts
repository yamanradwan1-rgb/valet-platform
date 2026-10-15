import type {
  DashboardApiClient, RuntimeSchema,
} from "../../../lib/api/dashboard-api-client";

export interface WhatsAppPolicyView {
  readonly enabled: boolean | null;
  readonly language: "ar" | "en" | null;
  readonly templateCatalogVersion: string | null;
  readonly providerBindingId: string | null;
  readonly revision: number;
}

export interface WhatsAppSettingsView {
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly policy: WhatsAppPolicyView;
  readonly companyDefault: WhatsAppPolicyView | null;
  readonly globalSendEnabled: boolean;
  readonly activationReady: false;
  readonly approvedTemplateVersions: readonly string[];
  readonly connections: readonly {
    id: string;
    phoneNumberId: string;
    wabaId: string;
    status: "PENDING_META_VERIFICATION" | "VERIFIED";
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function policy(value: unknown): value is WhatsAppPolicyView {
  return record(value) &&
    (value.enabled === null || typeof value.enabled === "boolean") &&
    (value.language === null || value.language === "ar" || value.language === "en") &&
    (value.templateCatalogVersion === null || typeof value.templateCatalogVersion === "string") &&
    (value.providerBindingId === null || typeof value.providerBindingId === "string") &&
    Number.isSafeInteger(value.revision) && Number(value.revision) >= 0;
}

export const whatsappSettingsSchema: RuntimeSchema<WhatsAppSettingsView> = {
  safeParse(value: unknown) {
    if (!record(value) || typeof value.organizationId !== "string" ||
        !(value.locationId === null || typeof value.locationId === "string") ||
        !policy(value.policy) || !(value.companyDefault === null || policy(value.companyDefault)) ||
        typeof value.globalSendEnabled !== "boolean" || value.activationReady !== false ||
        !Array.isArray(value.approvedTemplateVersions) ||
        !value.approvedTemplateVersions.every((v: unknown) => typeof v === "string") ||
        !Array.isArray(value.connections) ||
        !value.connections.every((c: unknown) => record(c) &&
          typeof c.id === "string" && typeof c.phoneNumberId === "string" &&
          typeof c.wabaId === "string" &&
          (c.status === "PENDING_META_VERIFICATION" || c.status === "VERIFIED"))) {
      return { success: false as const };
    }
    return { success: true as const, data: value as unknown as WhatsAppSettingsView };
  },
};

export function whatsappSettingsPath(org: string, location: string | null) {
  const base = `/v1/staff/management/organizations/${encodeURIComponent(org)}`;
  return location
    ? `${base}/locations/${encodeURIComponent(location)}/whatsapp-settings`
    : `${base}/whatsapp-settings`;
}

export function readWhatsAppSettings(
  api: DashboardApiClient, org: string, location: string | null, signal?: AbortSignal,
) {
  return api.request(whatsappSettingsPath(org, location), whatsappSettingsSchema, { signal });
}

export function saveWhatsAppSettings(
  api: DashboardApiClient, org: string, location: string | null,
  input: WhatsAppPolicyView,
) {
  return api.request(whatsappSettingsPath(org, location), whatsappSettingsSchema, {
    method: "PUT", body: { ...input, expectedRevision: input.revision },
  });
}
