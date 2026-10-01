"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { StaffAuthProvider } from "../lib/auth/staff-auth-context";
import { DashboardLocaleProvider } from "../lib/i18n/locale-provider";
import { DashboardThemeProvider } from "../lib/theme/theme-provider";
import { DashboardShellPresentationProvider } from "../components/foundation/dashboard-shell-presentation-provider";
import { SelectedScopeProvider } from "../components/foundation/selected-scope-provider";
import { AccountSecurityAccessProvider } from "../components/security/account-security-access-provider";

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const publicActivation = usePathname() === "/staff/activate";
  if (publicActivation) {
    return (
      <DashboardLocaleProvider>
        <DashboardThemeProvider>{children}</DashboardThemeProvider>
      </DashboardLocaleProvider>
    );
  }
  return (
    <DashboardLocaleProvider>
      <DashboardThemeProvider>
        <StaffAuthProvider>
          <AccountSecurityAccessProvider>
            <SelectedScopeProvider>
              <DashboardShellPresentationProvider>
                {children}
              </DashboardShellPresentationProvider>
            </SelectedScopeProvider>
          </AccountSecurityAccessProvider>
        </StaffAuthProvider>
      </DashboardThemeProvider>
    </DashboardLocaleProvider>
  );
}
