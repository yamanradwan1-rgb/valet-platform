import type { WhatsAppPolicyView } from "../settings/whatsapp-settings-api";
import type { StudioSaveResult, StudioWhatsAppData } from "./ui/studio-types";
import type { Scalar } from "./ui/catalog";
import type { useWhatsAppStudioSettings } from "./adapters/help-whatsapp/use-whatsapp-studio-settings";

type WhatsAppRead = ReturnType<typeof useWhatsAppStudioSettings>;
type Values = StudioWhatsAppData["saved"];

const unavailable: StudioSaveResult = { ok: false, reason: "unavailable" };

function values(policy: WhatsAppPolicyView | null): Values {
  return {
    waEnabled: policy?.enabled ?? null,
    waLanguage: policy?.language ?? null,
    waTemplate: policy?.templateCatalogVersion ?? null,
    waBinding: policy?.providerBindingId ?? null,
  };
}

function booleanOrNull(value: Scalar): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function languageOrNull(value: Scalar): value is "ar" | "en" | null {
  return value === null || value === "ar" || value === "en";
}

function textOrNull(value: Scalar): value is string | null {
  return value === null || typeof value === "string";
}

function formPolicy(
  saved: WhatsAppPolicyView,
  input: Values,
): WhatsAppPolicyView | null {
  if (
    !booleanOrNull(input.waEnabled) ||
    !languageOrNull(input.waLanguage) ||
    !textOrNull(input.waTemplate) ||
    !textOrNull(input.waBinding)
  )
    return null;
  return {
    ...saved,
    enabled: input.waEnabled,
    language: input.waLanguage,
    templateCatalogVersion: input.waTemplate || null,
    providerBindingId: input.waBinding || null,
  };
}

export function studioWhatsAppBridge(
  current: WhatsAppRead,
  editable: boolean,
  locale: "ar" | "en",
): StudioWhatsAppData {
  const view = current.view;
  const allowed = editable && !!view && !current.loading && !current.saving;
  return {
    defaults: values(view?.companyDefault ?? view?.policy ?? null),
    saved: values(view?.policy ?? null),
    templates: (view?.approvedTemplateVersions ?? []).map((name) => ({
      value: name,
      label: name,
    })),
    senders: (view?.connections ?? []).map((connection) => ({
      value: connection.id,
      label: `${connection.phoneNumberId} — ${
        connection.status === "VERIFIED"
          ? locale === "ar"
            ? "تم التحقق"
            : "Verified"
          : locale === "ar"
            ? "بانتظار التحقق من ميتا"
            : "Meta verification pending"
      }`,
    })),
    editable: allowed,
    loading: current.loading,
    busy: current.saving || current.loading,
    error: current.error,
    save: async (input) => {
      if (!allowed || !view) return unavailable;
      const next = formPolicy(view.policy, input);
      if (!next) return { ok: false, reason: "validation" };
      return (await current.saveValues(next)) ? { ok: true } : unavailable;
    },
  };
}
