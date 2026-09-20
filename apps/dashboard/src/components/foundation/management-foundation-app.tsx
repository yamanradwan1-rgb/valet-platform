"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import {
  md01NavigationRegistrations,
  resolveNavigation,
} from "../../lib/navigation";
import { LoginPanel } from "../auth/login-panel";
import { Button } from "../presentation/button";
import { Panel } from "../presentation/panel";
import { ScopeEntry } from "../scope";
import { AccountSecurityPanel } from "../security";
import { DashboardShell } from "../shell";
import { FoundationState } from "./foundation-state";
import { HeaderLocaleControl, HeaderThemeControl } from "./header-preferences";
import { HelpFoundation } from "./help-foundation";
import { PreferenceControls } from "./preference-controls";
import { selectedScopePresentation } from "./scope-presentation";
import { useSelectedScope } from "./selected-scope-provider";
import { useSelectedScopeRevalidation } from "./use-selected-scope-revalidation";
import { WorkspaceFoundation } from "./workspace-foundation";

export type ManagementFoundationView = "workspace" | "security" | "help";

export function ManagementFoundationApp({
  currentPath,
  view,
}: {
  readonly currentPath: string;
  readonly view: ManagementFoundationView;
}) {
  const auth = useStaffAuth();
  const { t } = useDashboardLocale();
  const { clearScope, selectedScope, selectScope } = useSelectedScope();
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaGeneration, setMfaGeneration] = useState(0);
  const api = useMemo(() => new DashboardApiClient({ auth: auth.client }), [auth.client]);
  const mfa = useMemo(() => new DashboardMfaClient(api), [api]);
  const revalidation = useSelectedScopeRevalidation({
    api,
    identityGeneration: auth.identityGeneration,
    sessionGeneration: auth.sessionGeneration,
    onDenied: clearScope,
    selectedScope: view === "security" ? null : selectedScope,
  });
  const requestLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await auth.logout();
    } catch {
      // Auth state becomes logout-unconfirmed and remains fail-closed.
    } finally {
      setLogoutPending(false);
    }
  };

  if (auth.status === "initializing") {
    return <FoundationState title="VAYLET" message={t("loading")} />;
  }
  if (auth.status === "refresh-unavailable") {
    return (
      <StandalonePanel>
        <p className="error-text">{t("unavailable")}</p>
        <Button onClick={() => void auth.refresh()} type="button">
          {t("refreshSession")}
        </Button>
      </StandalonePanel>
    );
  }
  if (auth.status === "logout-unconfirmed") {
    return (
      <StandalonePanel>
        <p className="error-text">{t("logoutUnconfirmed")}</p>
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button">
          {t("retryLogout")}
        </Button>
      </StandalonePanel>
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

  if (view === "security") {
    return (
      <StandalonePanel>
        <AccountSecurityPanel client={mfa} />
        <PreferenceControls />
        <Link className="nav-link foundation-link" href="/">{t("backToWorkspace")}</Link>
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button" variant="quiet">
          {t("logout")}
        </Button>
      </StandalonePanel>
    );
  }

  if (selectedScope === null) {
    return (
      <StandalonePanel>
        {mfaRequired ? (
          <AccountSecurityPanel
            client={mfa}
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
          identityGeneration={auth.identityGeneration}
          sessionGeneration={auth.sessionGeneration}
          key={mfaGeneration}
          labels={{
            allLocations: t("allLocations"),
            companyAdmin: t("companyAdmin"),
            dashboardAccessUnavailable: t("dashboardAccessUnavailable"),
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
      </StandalonePanel>
    );
  }

  if (revalidation.status === "checking") {
    return <FoundationState title="VAYLET" message={t("loading")} />;
  }
  if (revalidation.status === "entitlement") {
    return (
      <StandalonePanel>
        <p>{t("dashboardAccessUnavailable")}</p>
        <Button onClick={clearScope} type="button" variant="secondary">
          {t("changeScope")}
        </Button>
        <Link className="nav-link foundation-link" href="/security">{t("security")}</Link>
      </StandalonePanel>
    );
  }
  if (revalidation.status !== "valid") {
    return (
      <StandalonePanel>
        <p className="error-text">{t("unavailable")}</p>
        <Button onClick={() => selectScope(selectedScope)} type="button">
          {t("retry")}
        </Button>
        <Button onClick={clearScope} type="button" variant="secondary">
          {t("changeScope")}
        </Button>
      </StandalonePanel>
    );
  }

  const presentation = selectedScopePresentation(selectedScope);
  const navigation = resolveNavigation(
    md01NavigationRegistrations,
    presentation.navigation,
    t,
  );
  return (
    <DashboardShell
      accountControl={(
        <Button disabled={logoutPending} onClick={() => void requestLogout()} type="button" variant="quiet">
          {t("logout")}
        </Button>
      )}
      currentPath={currentPath}
      labels={{
        closeNavigation: t("closeNavigation"),
        location: t("location"),
        navigation: t("navigation"),
        openNavigation: t("openNavigation"),
        organization: t("organization"),
      }}
      localeControl={<HeaderLocaleControl />}
      navigationItems={navigation}
      organizationSelector={(
        <Button onClick={clearScope} type="button" variant="quiet">
          {t("changeScope")}
        </Button>
      )}
      selectedLocation={presentation.location}
      selectedOrganization={presentation.organization}
      themeControl={<HeaderThemeControl />}
    >
      {view === "help" ? (
        <HelpFoundation />
      ) : (
        <WorkspaceFoundation />
      )}
    </DashboardShell>
  );
}

function StandalonePanel({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="auth-card-wrap foundation-page">
      <Panel className="foundation-panel">
        <div className="stack">{children}</div>
      </Panel>
    </div>
  );
}
