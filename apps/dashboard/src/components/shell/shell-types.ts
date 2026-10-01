import type { ReactNode } from "react";

import type { DashboardNavigationItem } from "../../lib/navigation";

export interface DashboardScopeReference {
  readonly id: string;
  readonly label: string;
}

export interface DashboardShellLabels {
  readonly changeScope: string;
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
  readonly locationControl?: ReactNode;
  readonly navigationItems: readonly DashboardNavigationItem[];
  readonly onLocationSelect: () => void;
  readonly onOrganizationSelect: () => void;
  readonly selectedOrganization: DashboardScopeReference | null;
  readonly selectedLocation: DashboardScopeReference | null;
  readonly localeControl?: ReactNode;
  readonly themeControl?: ReactNode;
}
