"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  dashboardNavigationRegistrations,
  resolveNavigation,
} from "../../lib/navigation";
import { reconcileAccountSecurityNavigation } from "../../lib/navigation/account-security-navigation";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { Button } from "../presentation/button";
import { useAccountSecurityAccess } from "../security/account-security-access-provider";
import { DashboardShell } from "../shell";
import { LocationSwitchControl } from "../scope/location-switch-control";
import type { SwitchableDashboardScope } from "../scope/location-switch-authority";
import { navigationForLocationStatus } from "../scope/location-switch-policy";
import {
  DashboardNavigationPresentationCapture,
  dashboardShellPresentationKey,
} from "./dashboard-shell-presentation-provider";
import { dashboardShellLabels } from "./dashboard-shell-labels";
import { HeaderLocaleControl, HeaderThemeControl } from "./header-preferences";
import { ProtectedDashboardContextProvider } from "./protected-dashboard-context";
import { RootProductLanding } from "./root-product-landing";
import { selectedScopePresentation } from "./scope-presentation";
import { SelectedScopeMfaPanel } from "./selected-scope-mfa-panel";
import { useSelectedScope } from "./selected-scope-provider";
import {
  isDashboardUnavailable,
  isLocationSwitchSource,
  selectedManagementLocationStatus,
} from "./selected-management-shell-policy";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";
import { useNavigationAuthority } from "./use-navigation-authority";
import { useSelectedScopeRevalidation } from "./use-selected-scope-revalidation";
import { useNestedMfaBridge } from "./use-nested-mfa-bridge";
import { useSelectedManagementShellTransition } from "./selected-management-shell-transition";

export function SelectedManagementShell({
  accessRequirement,
  api,
  children,
  currentPath,
  logoutPending,
  requestLogout,
}: {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly children?: ReactNode;
  readonly currentPath: string;
  readonly logoutPending: boolean;
  readonly requestLogout: () => Promise<void>;
}) {
  const router = useRouter();
  const auth = useStaffAuth();
  const securityAccess = useAccountSecurityAccess();
  const { locale, t } = useDashboardLocale();
  const {
    clearScope,
    clearScopeIfEpoch,
    selectedScope,
    selectionRevision,
    selectScope,
  } = useSelectedScope();
  const [switchMfaKey, setSwitchMfaKey] = useState<string | null>(null);
  const currentSwitchKey = `${auth.identityGeneration}:${auth.sessionGeneration}:${currentPath}:${selectionRevision}`;
  const switchMfaRequired = switchMfaKey === currentSwitchKey;
  const nestedMfa = useNestedMfaBridge({
    currentPath, identityGeneration: auth.identityGeneration,
    selectedScope, selectionRevision, sessionGeneration: auth.sessionGeneration,
  });
  const { beginTransition, onDenied, transitionActive } =
    useSelectedManagementShellTransition({
      clearScopeIfEpoch,
      currentPath,
      identityGeneration: auth.identityGeneration,
      selectionRevision,
      sessionGeneration: auth.sessionGeneration,
    });

  const routeRevalidation = useSelectedScopeRevalidation({
    api,
    accessRequirement,
    identityGeneration: auth.identityGeneration,
    selectionRevision,
    sessionGeneration: auth.sessionGeneration,
    onDenied,
    selectedScope,
  });
  const navigationAuthority = useNavigationAuthority({
    api,
    identityGeneration: auth.identityGeneration,
    registrations: dashboardNavigationRegistrations,
    selectedScope,
    selectionRevision,
    sessionGeneration: auth.sessionGeneration,
  });

  if (selectedScope === null) return null;
  const authGenerationKey = `${auth.identityGeneration}:${auth.sessionGeneration}`;

  if (!transitionActive && routeRevalidation.status === "entitlement") {
    return (
      <StandaloneFoundationPanel>
        <p>
          {isDashboardUnavailable(accessRequirement)
            ? t("dashboardAccessUnavailable")
            : t("unavailable")}
        </p>
        <Button onClick={clearScope} type="button" variant="secondary">
          {t("changeScope")}
        </Button>
        {securityAccess.snapshot.status === "eligible" ? (
          <Link className="nav-link foundation-link" href="/security">
            {t("security")}
          </Link>
        ) : null}
      </StandaloneFoundationPanel>
    );
  }
  if (
    !transitionActive &&
    routeRevalidation.status === "denied" &&
    routeRevalidation.errorKind === "mfa"
  ) {
    return (
      <SelectedScopeMfaPanel
        changeScopeLabel={t("changeScope")}
        generationKey={`${authGenerationKey}:${selectionRevision}`}
        onAssured={() => selectScope(selectedScope)}
        onChangeScope={clearScope}
      />
    );
  }
  if (
    !transitionActive &&
    routeRevalidation.status !== "checking" &&
    (routeRevalidation.status !== "valid" ||
      routeRevalidation.routeAccess === null)
  ) {
    return (
      <StandaloneFoundationPanel>
        <p className="error-text">{t("unavailable")}</p>
        <Button onClick={() => selectScope(selectedScope)} type="button">
          {t("retry")}
        </Button>
        <Button onClick={clearScope} type="button" variant="secondary">
          {t("changeScope")}
        </Button>
      </StandaloneFoundationPanel>
    );
  }

  const presentation = selectedScopePresentation(selectedScope);
  const resolvedNavigation =
    navigationAuthority.status === "valid"
      ? navigationForLocationStatus(
          resolveNavigation(
            dashboardNavigationRegistrations,
            presentation.navigation,
            locale,
            navigationAuthority.authority,
          ),
          selectedManagementLocationStatus(selectedScope),
          selectedScope.authority === "COMPANY_ADMIN",
        )
      : [];
  const navigation = reconcileAccountSecurityNavigation(
    dashboardNavigationRegistrations,
    resolvedNavigation,
    locale,
    securityAccess.snapshot.status === "eligible",
  );
  const presentationBindingKey = dashboardShellPresentationKey({
    identityGeneration: auth.identityGeneration,
    selectedScope,
    selectionRevision,
    sessionGeneration: auth.sessionGeneration,
  });
  const selectedLocation =
    presentation.location ??
    (selectedScope.authority === "COMPANY_ADMIN" &&
    selectedScope.context.scope.kind === "ALL_LOCATIONS"
      ? { id: "all-locations", label: t("allLocations") }
      : selectedScope.authority === "LOCATION_MANAGER_GRANT_SET"
        ? { id: "location-grant-set", label: t("locations") }
        : null);

  const commitSwitch = (
    scope: SwitchableDashboardScope,
    destination: string | null,
  ) => {
    setSwitchMfaKey(null);
    if (destination !== null && destination !== currentPath) {
      beginTransition(destination);
    }
    selectScope(scope);
    if (destination !== null && destination !== currentPath)
      router.replace(destination);
  };

  const locationControl =
    isLocationSwitchSource(selectedScope) && selectedLocation ? (
      <LocationSwitchControl
        accessRequirement={accessRequirement}
        api={api}
        currentPath={currentPath}
        identityGeneration={auth.identityGeneration}
        onCommit={commitSwitch}
        onCurrentScopeInvalid={clearScopeIfEpoch}
        onMfaRequired={() => setSwitchMfaKey(currentSwitchKey)}
        scope={selectedScope}
        selectedLabel={selectedLocation.label}
        selectionRevision={selectionRevision}
        sessionGeneration={auth.sessionGeneration}
      />
    ) : undefined;

  return (
    <DashboardShell
      accountControl={
        <Button
          disabled={logoutPending}
          onClick={() => void requestLogout()}
          type="button"
          variant="quiet"
        >
          {t("logout")}
        </Button>
      }
      currentPath={currentPath}
      labels={dashboardShellLabels(t)}
      localeControl={<HeaderLocaleControl />}
      locationControl={locationControl}
      navigationItems={navigation}
      onLocationSelect={clearScope}
      onOrganizationSelect={clearScope}
      selectedLocation={selectedLocation}
      selectedOrganization={presentation.organization}
      themeControl={<HeaderThemeControl />}
    >
      {navigationAuthority.status === "valid" ? (
        <DashboardNavigationPresentationCapture
          bindingKey={presentationBindingKey}
          navigation={navigation}
        />
      ) : null}
      {switchMfaRequired || nestedMfa.required ? (
        <SelectedScopeMfaPanel
          changeScopeLabel={t("changeScope")}
          generationKey={nestedMfa.required ? nestedMfa.generationKey :
            `location-switch:${authGenerationKey}:${selectionRevision}`}
          onAssured={() => {
            if (nestedMfa.required && !nestedMfa.completeAssurance()) return;
            setSwitchMfaKey(null);
            selectScope(selectedScope);
          }}
          onChangeScope={clearScope}
        />
      ) : transitionActive ||
        routeRevalidation.status === "checking" ||
        navigationAuthority.status === "checking" ? (
        <p className="muted" role="status">
          {t("loading")}
        </p>
      ) : currentPath === "/" ? (
        <RootProductLanding
          authorityKey={navigationAuthority.key}
          loadingLabel={t("loading")}
          navigation={navigation}
          navigationStatus={navigationAuthority.status}
          unavailableLabel={t("unavailable")}
        />
      ) : (
        <ProtectedDashboardContextProvider
          key={presentationBindingKey}
          value={{
            api,
            identityGeneration: auth.identityGeneration,
            selectedScope,
            selectionRevision,
            sessionGeneration: auth.sessionGeneration,
            onNestedMfaRead: nestedMfa.onReadResult,
          }}
        >
          {children}
        </ProtectedDashboardContextProvider>
      )}
    </DashboardShell>
  );
}
