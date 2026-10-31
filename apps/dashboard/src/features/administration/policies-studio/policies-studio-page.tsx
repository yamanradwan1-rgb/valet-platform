"use client";

import { useState } from "react";
import type {
  ManagementLocation,
  ManagementOrganization,
} from "@valet/contracts";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationScopeKey } from "../administration-scope";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useStudioSettings } from "./adapters/settings/use-studio-settings";
import type { StudioSettingsScope } from "./adapters/settings/studio-settings-types";
import { usePoliciesStudioPresence } from "./adapters/presence/use-policies-studio-presence";
import { useWhatsAppStudioSettings } from "./adapters/help-whatsapp/use-whatsapp-studio-settings";
import {
  studioSettingsBridge,
  studioHoursBridge,
} from "./studio-settings-bridge";
import { studioPresenceBridge } from "./studio-presence-bridge";
import { studioWhatsAppBridge } from "./studio-whatsapp-bridge";
import { PoliciesStudioView } from "./ui/policies-studio-view";
import type { PoliciesStudioAdapter } from "./ui/studio-types";
import type { Role, Scope } from "./ui/catalog";

interface AuthorizedContext {
  readonly role: Exclude<Role, "DENIED">;
  readonly organization: ManagementOrganization;
  readonly location: ManagementLocation | null;
  readonly identity: string;
}

function AuthorizedStudio({
  context,
}: {
  readonly context: AuthorizedContext;
}) {
  const [scope, setScope] = useState<Scope>(
    context.role === "LOCATION_MANAGER" ? "location" : "company",
  );
  return (
    <AuthorizedScopedStudio
      key={`${context.identity}:${scope}`}
      context={context}
      scope={scope}
      onScopeChange={setScope}
    />
  );
}

function AuthorizedScopedStudio({
  context,
  scope,
  onScopeChange,
}: {
  readonly context: AuthorizedContext;
  readonly scope: Scope;
  readonly onScopeChange: (next: Scope) => void;
}) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const isLocation = scope === "location";
  const validLocation = context.location?.status === "ACTIVE";
  const canRead = !isLocation || validLocation;
  const settingsScope: StudioSettingsScope =
    context.role === "LOCATION_MANAGER"
      ? { kind: "manager-location", locationId: context.location!.locationId }
      : isLocation
        ? {
            kind: "management-location",
            organizationId: context.organization.organizationId,
            locationId: context.location?.locationId ?? "",
          }
        : {
            kind: "company",
            organizationId: context.organization.organizationId,
          };

  const settings = useStudioSettings({
    api: dashboard.api,
    scope: settingsScope,
    enabled: canRead,
  });
  const presence = usePoliciesStudioPresence({ company: !isLocation });
  const whatsapp = useWhatsAppStudioSettings({
    api: dashboard.api,
    organizationId: context.organization.organizationId,
    locationId: isLocation ? (context.location?.locationId ?? null) : null,
    locale,
    scopeIdentity: `${context.identity}:${scope}`,
    enabled: context.role === "COMPANY_ADMIN" && canRead,
  });
  const editable =
    canRead &&
    (context.role === "COMPANY_ADMIN" || context.role === "LOCATION_MANAGER");
  const status = !canRead
    ? "empty"
    : settings.loading
      ? "loading"
      : settings.error
        ? "error"
        : settings.snapshot
          ? "ready"
          : "empty";
  const location = context.location
    ? {
        id: context.location.locationId,
        label: context.location.name,
        currency: context.location.currency,
        timezone: context.location.timezone,
      }
    : null;
  const adapter: PoliciesStudioAdapter = {
    role: context.role,
    locale,
    organization: {
      id: context.organization.organizationId,
      label: context.organization.name,
    },
    location,
    scope,
    status,
    ...(settings.error ? { error: settings.error.message } : {}),
    settings: studioSettingsBridge(settings, editable),
    hours: studioHoursBridge(
      settings,
      editable,
      isLocation,
      location?.timezone ?? null,
    ),
    presence: studioPresenceBridge(presence, locale),
    whatsapp: studioWhatsAppBridge(
      whatsapp,
      context.role === "COMPANY_ADMIN" && canRead,
      locale,
    ),
    onScopeChange,
    reload: async () => {
      settings.refresh();
      if (presence.mutation.pending) await presence.mutation.reconcile();
      else presence.actions.refresh();
      whatsapp.reload();
    },
  };

  return (
    <>
      <PoliciesStudioView adapter={adapter} />
      {settings.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={settings.onMfaAssured}
          onClose={settings.closeMfa}
        />
      ) : null}
      {presence.mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={presence.mutation.onAssured}
          onClose={presence.mutation.closeMfa}
        />
      ) : null}
      {whatsapp.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={whatsapp.onMfaAssured}
          onClose={whatsapp.closeMfa}
        />
      ) : null}
    </>
  );
}

const blocked = { ok: false as const, reason: "forbidden" as const };

function DeniedStudio({ label }: { readonly label: string }) {
  const { locale } = useDashboardLocale();
  const adapter: PoliciesStudioAdapter = {
    role: "DENIED",
    locale,
    organization: { id: "", label },
    location: null,
    scope: "location",
    status: "denied",
    settings: {
      defaults: {},
      overrides: {},
      effective: {},
      overridePresent: {},
      availableKeys: [],
      editableKeys: [],
      busy: false,
      error: null,
      save: async () => blocked,
      clear: async () => blocked,
    },
    hours: {
      revision: null,
      company: null,
      override: null,
      effective: null,
      inherited: false,
      timezone: null,
      editable: false,
      busy: false,
      save: async () => blocked,
      clear: async () => blocked,
    },
    presence: {
      values: {
        defaults: {},
        overrides: {},
        effective: {},
        overridePresent: {},
      },
      readiness: { state: "UNKNOWN" },
      zones: [],
      loading: false,
      error: null,
      editable: false,
      zonesEditable: false,
      busy: false,
      availableKeys: [],
      savePolicy: async () => blocked,
      saveZone: async () => blocked,
    },
    whatsapp: {
      revision: null,
      defaults: {
        waEnabled: null,
        waLanguage: null,
        waTemplate: null,
        waBinding: null,
      },
      saved: {
        waEnabled: null,
        waLanguage: null,
        waTemplate: null,
        waBinding: null,
      },
      templates: [],
      senders: [],
      editable: false,
      loading: false,
      busy: false,
      error: null,
      save: async () => blocked,
    },
    onScopeChange: () => undefined,
    reload: async () => undefined,
  };
  return <PoliciesStudioView adapter={adapter} />;
}

export function PoliciesStudioPage() {
  const dashboard = useProtectedDashboard();
  const selected = dashboard.selectedScope;
  if (selected.authority === "COMPANY_ADMIN") {
    return (
      <AuthorizedStudio
        key={administrationScopeKey(dashboard)}
        context={{
          role: "COMPANY_ADMIN",
          organization: selected.context.organization,
          location: selected.context.selectedLocation,
          identity: administrationScopeKey(dashboard),
        }}
      />
    );
  }
  if (selected.authority === "LOCATION_MANAGER") {
    return (
      <AuthorizedStudio
        key={administrationScopeKey(dashboard)}
        context={{
          role: "LOCATION_MANAGER",
          organization: selected.organization,
          location: selected.location,
          identity: administrationScopeKey(dashboard),
        }}
      />
    );
  }
  return (
    <DeniedStudio
      label={
        "organization" in selected
          ? selected.organization.name
          : selected.context.organization.name
      }
    />
  );
}
