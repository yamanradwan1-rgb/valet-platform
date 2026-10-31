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
  authoritativeView: WhatsAppSettingsView,
  draft: WhatsAppStudioDraft,
) {
  assertWhatsAppStudioScope(authoritativeView, organizationId, locationId);
  // W2's editor owns its draft; only the loaded server view owns the CAS token.
  const mutation: WhatsAppStudioDraft = {
    enabled: draft.enabled,
    language: draft.language,
    templateCatalogVersion: draft.templateCatalogVersion,
    providerBindingId: draft.providerBindingId,
    revision: authoritativeView.policy.revision,
  };
  return assertWhatsAppStudioScope(
    await saveWhatsAppSettings(api, organizationId, locationId, mutation),
    organizationId,
    locationId,
  );
}

/** A sensitive save succeeds only when the guarded mutation confirms success. */
export async function saveSensitiveScopedWhatsAppStudio(
  run: (
    operation: () => Promise<WhatsAppSettingsView>,
    onSuccess: (view: WhatsAppSettingsView) => void,
  ) => Promise<void>,
  api: DashboardApiClient,
  organizationId: string,
  locationId: string | null,
  authoritativeView: WhatsAppSettingsView,
  draft: WhatsAppStudioDraft,
): Promise<WhatsAppSettingsView | null> {
  let confirmed: WhatsAppSettingsView | null = null;
  await run(
    () =>
      saveScopedWhatsAppStudio(
        api,
        organizationId,
        locationId,
        authoritativeView,
        draft,
      ),
    (view) => {
      confirmed = view;
    },
  );
  return confirmed;
}
