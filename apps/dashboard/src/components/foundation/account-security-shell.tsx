"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { dashboardNavigationRegistrations } from "../../lib/navigation";
import {
  navigationItemsFromPresentationIds,
  reconcileAccountSecurityNavigation,
} from "../../lib/navigation/account-security-navigation";
import { Button } from "../presentation/button";
import { AccountSecurityWorkspace } from "../security/account-security-workspace";
import { useAccountSecurityAccess } from "../security/account-security-access-provider";
import { DashboardShell } from "../shell";
import {
  dashboardShellPresentationKey,
  useDashboardShellPresentation,
} from "./dashboard-shell-presentation-provider";
import { dashboardShellLabels } from "./dashboard-shell-labels";
import { HeaderLocaleControl, HeaderThemeControl } from "./header-preferences";
import { selectedScopePresentation } from "./scope-presentation";
import { useSelectedScope } from "./selected-scope-provider";

export function AccountSecurityShell(props: {
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly logoutPending: boolean;
  readonly onLogout: () => Promise<void>;
  readonly sessionGeneration: number;
}) {
  const router = useRouter();
  const { locale, t } = useDashboardLocale();
  const { clearScope, selectedScope, selectionRevision } = useSelectedScope();
  const { refreshState, snapshot: accessSnapshot } = useAccountSecurityAccess();
  const generationKey = `${props.identityGeneration}:${props.sessionGeneration}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const entryReady = readyKey === generationKey;
  const presentationStore = useDashboardShellPresentation();
  const bindingKey = selectedScope
    ? dashboardShellPresentationKey({
        identityGeneration: props.identityGeneration,
        selectedScope,
        selectionRevision,
        sessionGeneration: props.sessionGeneration,
      })
    : null;
  const snapshot = bindingKey ? presentationStore.read(bindingKey) : null;
  const scopePresentation =
    snapshot && selectedScope ? selectedScopePresentation(selectedScope) : null;
  const baseNavigation = navigationItemsFromPresentationIds(
    dashboardNavigationRegistrations,
    snapshot?.destinationIds ?? [],
    locale,
  );
  const navigation = reconcileAccountSecurityNavigation(
    dashboardNavigationRegistrations,
    baseNavigation,
    locale,
    entryReady && accessSnapshot.status === "eligible",
  );
  const selectedLocation =
    scopePresentation?.location ??
    (snapshot &&
    selectedScope?.authority === "COMPANY_ADMIN" &&
    selectedScope.context.scope.kind === "ALL_LOCATIONS"
      ? { id: "all-locations", label: t("allLocations") }
      : null);
  const changeScope = () => {
    clearScope();
    router.push("/");
  };

  useEffect(() => {
    let active = true;
    void refreshState().then(() => {
      if (active) setReadyKey(generationKey);
    });
    return () => { active = false; };
  }, [generationKey, refreshState]);

  return (
    <DashboardShell
      accountControl={(
        <Button
          disabled={props.logoutPending}
          onClick={() => void props.onLogout()}
          type="button"
          variant="quiet"
        >
          {t("logout")}
        </Button>
      )}
      currentPath={props.currentPath}
      labels={dashboardShellLabels(t)}
      localeControl={<HeaderLocaleControl />}
      navigationItems={navigation}
      onLocationSelect={changeScope}
      onOrganizationSelect={changeScope}
      selectedLocation={selectedLocation}
      selectedOrganization={scopePresentation?.organization ?? null}
      themeControl={<HeaderThemeControl />}
    >
      <AccountSecurityWorkspace key={generationKey} ready={entryReady} />
    </DashboardShell>
  );
}
