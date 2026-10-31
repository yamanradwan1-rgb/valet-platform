import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import {
  readWhatsAppSettings,
  saveWhatsAppSettings,
  type WhatsAppPolicyView,
  type WhatsAppSettingsView,
} from "../../../settings/whatsapp-settings-api";

export type WhatsAppStudioDraft = WhatsAppPolicyView;
export type WhatsAppStudioPatch = Partial<
  Pick<
    WhatsAppPolicyView,
    "enabled" | "language" | "templateCatalogVersion" | "providerBindingId"
  >
>;

export type WhatsAppStudioField =
  "waEnabled" | "waLanguage" | "waTemplate" | "waBinding";

const policyField = {
  waEnabled: "enabled",
  waLanguage: "language",
  waTemplate: "templateCatalogVersion",
  waBinding: "providerBindingId",
} as const;

export function whatsappStudioDirty(
  saved: WhatsAppStudioDraft | null,
  draft: WhatsAppStudioDraft | null,
): boolean {
  if (!saved || !draft) return false;
  return (
    saved.enabled !== draft.enabled ||
    saved.language !== draft.language ||
    saved.templateCatalogVersion !== draft.templateCatalogVersion ||
    saved.providerBindingId !== draft.providerBindingId
  );
}

/** The API supplies both the stored override and its actual company default. */
export function whatsappStudioFieldValue(
  view: WhatsAppSettingsView,
  field: WhatsAppStudioField,
) {
  const name = policyField[field];
  const saved = view.policy[name];
  const inherited = view.locationId !== null && saved === null;
  return {
    saved,
    effective: inherited ? (view.companyDefault?.[name] ?? null) : saved,
    source: inherited
      ? ("inherited" as const)
      : view.locationId === null
        ? ("default" as const)
        : ("override" as const),
  };
}

export function assertWhatsAppStudioScope(
  view: WhatsAppSettingsView,
  organizationId: string,
  locationId: string | null,
): WhatsAppSettingsView {
  if (
    view.organizationId !== organizationId ||
    view.locationId !== locationId
  ) {
    throw new Error("WHATSAPP_SCOPE_MISMATCH");
  }
  return view;
}

export async function readScopedWhatsAppStudio(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string | null,
  signal?: AbortSignal,
) {
  return assertWhatsAppStudioScope(
    await readWhatsAppSettings(api, organizationId, locationId, signal),
    organizationId,
    locationId,
  );
}

/** The existing API performs one CAS-protected, audited bundled policy PUT. */
export async function saveScopedWhatsAppStudio(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string | null,
  draft: WhatsAppStudioDraft,
) {
  return assertWhatsAppStudioScope(
    await saveWhatsAppSettings(api, organizationId, locationId, draft),
    organizationId,
    locationId,
  );
}
