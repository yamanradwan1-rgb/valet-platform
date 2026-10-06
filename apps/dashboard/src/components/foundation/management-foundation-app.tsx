"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { LoginPanel } from "../auth/login-panel";
import { Button } from "../presentation/button";
import { AccountSecurityShell } from "./account-security-shell";
import { FoundationState } from "./foundation-state";
import { SelectedManagementShell } from "./selected-management-shell";
import { useSelectedScope } from "./selected-scope-provider";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";
import { UnselectedScopeFoundation } from "./unselected-scope-foundation";
import { useFoundationLogout } from "./use-foundation-logout";

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
  const { t } = useDashboardLocale();
  const { restorationStatus, selectedScope } = useSelectedScope();
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const api = useMemo(
    () => new DashboardApiClient({ auth: auth.client }),
    [auth.client],
  );
  const { logoutPending, requestLogout } = useFoundationLogout(auth.logout);
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
        <Button
          disabled={logoutPending}
          onClick={() => void requestLogout()}
          type="button"
        >
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
  if (accountSecurity) {
    return (
      <AccountSecurityShell
        api={api}
        currentPath={currentPath}
        identityGeneration={auth.identityGeneration}
        logoutPending={logoutPending}
        onLogout={requestLogout}
        sessionGeneration={auth.sessionGeneration}
      />
    );
  }

  if (restorationStatus === "checking") {
    return <FoundationState title="VAYLET" message={t("loading")} />;
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

  return (
    <SelectedManagementShell
      accessRequirement={accessRequirement}
      api={api}
      currentPath={currentPath}
      logoutPending={logoutPending}
      requestLogout={requestLogout}
    >
      {children}
    </SelectedManagementShell>
  );
}
