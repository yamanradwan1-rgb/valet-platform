"use client";

import type { ReactNode } from "react";

import { StaffAuthProvider } from "../lib/auth/staff-auth-context";
import { DashboardLocaleProvider } from "../lib/i18n/locale-provider";
import { DashboardThemeProvider } from "../lib/theme/theme-provider";
import { DashboardShellPresentationProvider } from "../components/foundation/dashboard-shell-presentation-provider";
import { SelectedScopeProvider } from "../components/foundation/selected-scope-provider";
import { AccountSecurityAccessProvider } from "../components/security/account-security-access-provider";

export function AppProviders({ children }: { readonly children: ReactNode }) {
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
