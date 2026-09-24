"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import {
  dashboardNavigationRegistrations,
  resolveNavigation,
} from "../../lib/navigation";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { LoginPanel } from "../auth/login-panel";
import { Button } from "../presentation/button";
import { ScopeEntry } from "../scope";
import { AccountSecurityPanel } from "../security";
import { DashboardShell } from "../shell";
import { FoundationState } from "./foundation-state";
import { HeaderLocaleControl, HeaderThemeControl } from "./header-preferences";
import { PreferenceControls } from "./preference-controls";
import { ProtectedDashboardContextProvider } from "./protected-dashboard-context";
import { RootProductLanding } from "./root-product-landing";
import { selectedScopePresentation } from "./scope-presentation";
import { SelectedScopeMfaPanel } from "./selected-scope-mfa-panel";
import { useSelectedScope } from "./selected-scope-provider";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";
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
  const { locale, t } = useDashboardLocale();
  const { clearScope, selectedScope, selectionRevision, selectScope } =
    useSelectedScope();
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaGeneration, setMfaGeneration] = useState(0);
  const api = useMemo(() => new DashboardApiClient({ auth: auth.client }), [auth.client]);
  const mfa = useMemo(() => new DashboardMfaClient(api), [api]);
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
      <StandaloneFoundationPanel>
        <AccountSecurityPanel client={mfa} key={authGenerationKey} />
        <PreferenceControls />
        <Link className="nav-link foundation-link" href="/">{t("backToWorkspace")}</Link>
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button" variant="quiet">
          {t("logout")}
        </Button>
      </StandaloneFoundationPanel>
    );
  }

  if (selectedScope === null) {
    return (
      <StandaloneFoundationPanel>
        {mfaRequired ? (
          <AccountSecurityPanel
            client={mfa}
            key={authGenerationKey}
            onStateChange={(state) => {
              if (state === "ASSURED") {
                setMfaRequired(false);
                setMfaGeneration((value) => value + 1);
              }
            }}
          />
        ) : null}
        <ScopeEntry
          api={api}
          accessRequirement={accessRequirement}
          identityGeneration={auth.identityGeneration}
          sessionGeneration={auth.sessionGeneration}
          key={mfaGeneration}
          labels={{
            allLocations: t("allLocations"),
            companyAdmin: t("companyAdmin"),
            dashboardAccessUnavailable: t("dashboardAccessUnavailable"),
            featureAccessUnavailable: t("unavailable"),
            inactiveHistorical: t("inactiveHistorical"),
            loadError: t("loadError"),
            loadMore: t("loadMore"),
            loading: t("loading"),
            locationManager: t("locationManager"),
            locations: t("locations"),
            noneAvailable: t("noEligibleScope"),
            retry: t("retry"),
            supervisor: t("supervisor"),
            title: t("chooseScope"),
          }}
          onMfaRequired={() => setMfaRequired(true)}
          onSelect={selectScope}
        />
        <div className="scope-line">
          <Link className="nav-link foundation-link" href="/security">{t("security")}</Link>
          <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button" variant="quiet">
            {t("logout")}
          </Button>
        </div>
      </StandaloneFoundationPanel>
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
        <Link className="nav-link foundation-link" href="/security">{t("security")}</Link>
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
        client={mfa}
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
  const navigation =
    navigationAuthority.status === "valid"
      ? resolveNavigation(
          dashboardNavigationRegistrations,
          presentation.navigation,
          locale,
          navigationAuthority.authority,
        )
      : [];
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
      labels={{
        changeScope: t("changeScope"),
        collapseNavigation: t("collapseNavigation"),
        closeNavigation: t("closeNavigation"),
        expandNavigation: t("expandNavigation"),
        location: t("location"),
        navigation: t("navigation"),
        openNavigation: t("openNavigation"),
        organization: t("organization"),
      }}
      localeControl={<HeaderLocaleControl />}
      navigationItems={navigation}
      onLocationSelect={clearScope}
      onOrganizationSelect={clearScope}
      selectedLocation={selectedLocation}
      selectedOrganization={presentation.organization}
      themeControl={<HeaderThemeControl />}
    >
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
