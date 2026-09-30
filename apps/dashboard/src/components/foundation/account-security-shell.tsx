"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  dashboardNavigationRegistrations,
  type DashboardNavigationItem,
} from "../../lib/navigation";
import {
  navigationItemsFromPresentationIds,
  reconcileAccountSecurityNavigation,
} from "../../lib/navigation/account-security-navigation";
import { Button } from "../presentation/button";
import { LocationSwitchControl } from "../scope/location-switch-control";
import type { SwitchableDashboardScope } from "../scope/location-switch-authority";
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
import { SelectedScopeMfaPanel } from "./selected-scope-mfa-panel";
import { isLocationSwitchSource } from "./selected-management-shell-policy";
import { useSelectedScope } from "./selected-scope-provider";

export function AccountSecurityShell(props: {
  readonly api: DashboardApiClient;
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly logoutPending: boolean;
  readonly onLogout: () => Promise<void>;
  readonly sessionGeneration: number;
}) {
  const router = useRouter();
  const { locale, t } = useDashboardLocale();
  const {
    clearScope,
    clearScopeIfEpoch,
    selectedScope,
    selectionRevision,
    selectScope,
  } = useSelectedScope();
  const { refreshState, snapshot: accessSnapshot } = useAccountSecurityAccess();
  const generationKey = `${props.identityGeneration}:${props.sessionGeneration}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [switchMfaRequired, setSwitchMfaRequired] = useState(false);
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
  const scopePresentation = selectedScope
    ? selectedScopePresentation(selectedScope)
    : null;
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
    (selectedScope?.authority === "COMPANY_ADMIN" &&
    selectedScope.context.scope.kind === "ALL_LOCATIONS"
      ? { id: "all-locations", label: t("allLocations") }
      : selectedScope?.authority === "LOCATION_MANAGER_GRANT_SET"
        ? { id: "location-grant-set", label: t("locations") }
        : null);
  const changeScope = () => {
    clearScope();
    router.push("/");
  };
  const commitSwitch = (
    scope: SwitchableDashboardScope,
    navigation: readonly DashboardNavigationItem[],
  ) => {
    setSwitchMfaRequired(false);
    presentationStore.remember(
      dashboardShellPresentationKey({
        identityGeneration: props.identityGeneration,
        selectedScope: scope,
        selectionRevision: selectionRevision + 1,
        sessionGeneration: props.sessionGeneration,
      }),
      navigation,
    );
    selectScope(scope);
  };
  const locationControl =
    selectedScope &&
    isLocationSwitchSource(selectedScope) &&
    selectedLocation ? (
      <LocationSwitchControl
        accessRequirement="FOUNDATION_ENTRY"
        api={props.api}
        currentPath={props.currentPath}
        identityGeneration={props.identityGeneration}
        onCommit={(scope, _destination, navigation) =>
          commitSwitch(scope, navigation)
        }
        onCurrentScopeInvalid={(epoch) => {
          clearScopeIfEpoch(epoch);
          router.replace("/");
        }}
        onMfaRequired={() => setSwitchMfaRequired(true)}
        preserveIndependentRoute
        scope={selectedScope}
        selectedLabel={selectedLocation.label}
        selectionRevision={selectionRevision}
        sessionGeneration={props.sessionGeneration}
      />
    ) : undefined;

  useEffect(() => {
    let active = true;
    void refreshState().then(() => {
      if (active) setReadyKey(generationKey);
    });
    return () => {
      active = false;
    };
  }, [generationKey, refreshState]);

  return (
    <DashboardShell
      accountControl={
        <Button
          disabled={props.logoutPending}
          onClick={() => void props.onLogout()}
          type="button"
          variant="quiet"
        >
          {t("logout")}
        </Button>
      }
      currentPath={props.currentPath}
      labels={dashboardShellLabels(t)}
      localeControl={<HeaderLocaleControl />}
      locationControl={locationControl}
      navigationItems={navigation}
      onLocationSelect={changeScope}
      onOrganizationSelect={changeScope}
      selectedLocation={selectedLocation}
      selectedOrganization={scopePresentation?.organization ?? null}
      themeControl={<HeaderThemeControl />}
    >
      {switchMfaRequired && selectedScope ? (
        <SelectedScopeMfaPanel
          changeScopeLabel={t("changeScope")}
          generationKey={`security-location-switch:${generationKey}:${selectionRevision}`}
          onAssured={() => {
            setSwitchMfaRequired(false);
            selectScope(selectedScope);
          }}
          onChangeScope={changeScope}
        />
      ) : (
        <AccountSecurityWorkspace key={generationKey} ready={entryReady} />
      )}
    </DashboardShell>
  );
}
