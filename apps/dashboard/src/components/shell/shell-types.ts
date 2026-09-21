import type { ReactNode } from "react";

import type { DashboardNavigationItem } from "../../lib/navigation";

export interface DashboardScopeReference {
  readonly id: string;
  readonly label: string;
}

export interface DashboardShellLabels {
  readonly collapseNavigation: string;
  readonly closeNavigation: string;
  readonly expandNavigation: string;
  readonly location: string;
  readonly navigation: string;
  readonly openNavigation: string;
  readonly organization: string;
}

export interface DashboardShellProps {
  readonly accountControl?: ReactNode;
  readonly children: ReactNode;
  readonly currentPath: string;
  readonly labels: DashboardShellLabels;
  readonly navigationItems: readonly DashboardNavigationItem[];
  readonly selectedOrganization: DashboardScopeReference | null;
  readonly selectedLocation: DashboardScopeReference | null;
  readonly organizationSelector?: ReactNode;
  readonly locationSelector?: ReactNode;
  readonly localeControl?: ReactNode;
  readonly themeControl?: ReactNode;
}
