"use client";

import type { ReactNode } from "react";

import { StaffAuthProvider } from "../lib/auth/staff-auth-context";
import { DashboardLocaleProvider } from "../lib/i18n/locale-provider";
import { DashboardThemeProvider } from "../lib/theme/theme-provider";
import { SelectedScopeProvider } from "../components/foundation/selected-scope-provider";

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <DashboardLocaleProvider>
      <DashboardThemeProvider>
        <StaffAuthProvider>
          <SelectedScopeProvider>{children}</SelectedScopeProvider>
        </StaffAuthProvider>
      </DashboardThemeProvider>
    </DashboardLocaleProvider>
  );
}
