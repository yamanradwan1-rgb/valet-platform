"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  dashboardNavigationRegistrations,
  resolveNavigation,
} from "../../lib/navigation";
import { reconcileAccountSecurityNavigation } from "../../lib/navigation/account-security-navigation";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { LoginPanel } from "../auth/login-panel";
import { Button } from "../presentation/button";
import { useAccountSecurityAccess } from "../security/account-security-access-provider";
import { DashboardShell } from "../shell";
import { AccountSecurityShell } from "./account-security-shell";
import {
  DashboardNavigationPresentationCapture,
  dashboardShellPresentationKey,
} from "./dashboard-shell-presentation-provider";
import { dashboardShellLabels } from "./dashboard-shell-labels";
import { FoundationState } from "./foundation-state";
import { HeaderLocaleControl, HeaderThemeControl } from "./header-preferences";
import { ProtectedDashboardContextProvider } from "./protected-dashboard-context";
import { RootProductLanding } from "./root-product-landing";
import { selectedScopePresentation } from "./scope-presentation";
import { SelectedScopeMfaPanel } from "./selected-scope-mfa-panel";
import { useSelectedScope } from "./selected-scope-provider";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";
import { UnselectedScopeFoundation } from "./unselected-scope-foundation";
import { useFoundationLogout } from "./use-foundation-logout";
import { useNavigationAuthority } from "./use-navigation-authority";
import { useSelectedScopeRevalidation } from "./use-selected-scope-revalidation";

export function ManagementFoundationApp({
  accountSecurity = false,
  children,
  accessRequirement = "DASHBOARD",
}: {
  readonly accountSecurity?: boolean;
  readonly children?: ReactNode;
  readonly accessRequirement?: DashboardRouteAccessRequirement;
}) {
  const currentPath = usePathname();
  const auth = useStaffAuth();
  const securityAccess = useAccountSecurityAccess();
  const { locale, t } = useDashboardLocale();
  const { clearScope, selectedScope, selectionRevision, selectScope } =
    useSelectedScope();
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const api = useMemo(() => new DashboardApiClient({ auth: auth.client }), [auth.client]);
  const { logoutPending, requestLogout } = useFoundationLogout(auth.logout);
  const routeRevalidation = useSelectedScopeRevalidation({
    api,
    accessRequirement,
    identityGeneration: auth.identityGeneration,
    selectionRevision,
    sessionGeneration: auth.sessionGeneration,
    onDenied: clearScope,
    selectedScope: accountSecurity ? null : selectedScope,
  });
  const navigationAuthority = useNavigationAuthority({
    api,
    identityGeneration: auth.identityGeneration,
    registrations: dashboardNavigationRegistrations,
    selectedScope: accountSecurity ? null : selectedScope,
    selectionRevision,
    sessionGeneration: auth.sessionGeneration,
  });
  if (auth.status === "initializing") {
    return <FoundationState title="VAYLET" message={t("loading")} />;
  }
  if (auth.status === "refresh-unavailable") {
    return (
      <StandaloneFoundationPanel>
        <p className="error-text">{t("unavailable")}</p>
        <Button onClick={() => void auth.refresh()} type="button">
          {t("refreshSession")}
        </Button>
      </StandaloneFoundationPanel>
    );
  }
  if (auth.status === "logout-unconfirmed") {
    return (
      <StandaloneFoundationPanel>
        <p className="error-text">{t("logoutUnconfirmed")}</p>
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button">
          {t("retryLogout")}
        </Button>
      </StandaloneFoundationPanel>
    );
  }
  if (auth.status === "unauthenticated") {
    return (
      <LoginPanel
        error={loginError}
        loading={loginPending}
        onLogin={async (credentials) => {
          setLoginPending(true);
          setLoginError(null);
          try {
            await auth.login(credentials);
          } catch {
            setLoginError(t("loginFailed"));
          } finally {
            setLoginPending(false);
          }
        }}
      />
    );
  }
  const authGenerationKey = `${auth.identityGeneration}:${auth.sessionGeneration}`;
  if (accountSecurity) {
    return (
      <AccountSecurityShell
        currentPath={currentPath}
        identityGeneration={auth.identityGeneration}
        logoutPending={logoutPending}
        onLogout={requestLogout}
        sessionGeneration={auth.sessionGeneration}
      />
    );
  }

  if (selectedScope === null) {
    return (
      <UnselectedScopeFoundation
        accessRequirement={accessRequirement}
        api={api}
        identityGeneration={auth.identityGeneration}
        logoutPending={logoutPending}
        onLogout={requestLogout}
        sessionGeneration={auth.sessionGeneration}
      />
    );
  }

  if (routeRevalidation.status === "checking") {
    return <FoundationState title="VAYLET" message={t("loading")} />;
  }
  if (routeRevalidation.status === "entitlement") {
    return (
      <StandaloneFoundationPanel>
        <p>
          {accessRequirement === "DASHBOARD" ||
          accessRequirement === "FOUNDATION_ENTRY" ||
          accessRequirement === "LOCATION_MAPS"
            ? t("dashboardAccessUnavailable")
            : t("unavailable")}
        </p>
        <Button onClick={clearScope} type="button" variant="secondary">
          {t("changeScope")}
        </Button>
        {securityAccess.snapshot.status === "eligible" ? (
          <Link className="nav-link foundation-link" href="/security">{t("security")}</Link>
        ) : null}
      </StandaloneFoundationPanel>
    );
  }
  if (
    routeRevalidation.status === "denied" &&
    routeRevalidation.errorKind === "mfa"
  ) {
    return (
      <SelectedScopeMfaPanel
        changeScopeLabel={t("changeScope")}
        generationKey={authGenerationKey + ":" + selectionRevision}
        onAssured={() => selectScope(selectedScope)}
        onChangeScope={clearScope}
      />
    );
  }
  if (
    routeRevalidation.status !== "valid" ||
    routeRevalidation.routeAccess === null
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
      ? resolveNavigation(
          dashboardNavigationRegistrations,
          presentation.navigation,
          locale,
          navigationAuthority.authority,
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
      : null);
  return (
    <DashboardShell
      accountControl={(
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button" variant="quiet">
          {t("logout")}
        </Button>
      )}
      currentPath={currentPath}
      labels={dashboardShellLabels(t)}
      localeControl={<HeaderLocaleControl />}
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
      {currentPath === "/" ? (
        <RootProductLanding
          authorityKey={navigationAuthority.key}
          loadingLabel={t("loading")}
          navigation={navigation}
          navigationStatus={navigationAuthority.status}
          unavailableLabel={t("unavailable")}
        />
      ) : (
        <ProtectedDashboardContextProvider
          value={{
            api,
            identityGeneration: auth.identityGeneration,
            selectedScope,
            sessionGeneration: auth.sessionGeneration,
          }}
        >
          {children}
        </ProtectedDashboardContextProvider>
      )}
    </DashboardShell>
  );
}
