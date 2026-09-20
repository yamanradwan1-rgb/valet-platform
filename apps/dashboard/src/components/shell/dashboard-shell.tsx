"use client";

import { useState } from "react";

import { MobileNavigationDialog } from "./mobile-navigation-dialog";
import { DashboardSidebar } from "./sidebar";
import type { DashboardShellProps } from "./shell-types";
import { DashboardTopbar } from "./topbar";

export function DashboardShell({
  accountControl,
  children,
  currentPath,
  labels,
  localeControl,
  locationSelector,
  navigationItems,
  organizationSelector,
  selectedLocation,
  selectedOrganization,
  themeControl,
}: DashboardShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="shell">
      <DashboardSidebar
        currentPath={currentPath}
        items={navigationItems}
        navigationLabel={labels.navigation}
      />
      <div className="shell-main">
        <DashboardTopbar
          accountControl={accountControl}
          labels={labels}
          localeControl={localeControl}
          locationSelector={locationSelector}
          navigationOpen={navigationOpen}
          onOpenNavigation={() => setNavigationOpen(true)}
          organizationSelector={organizationSelector}
          selectedLocation={selectedLocation}
          selectedOrganization={selectedOrganization}
          themeControl={themeControl}
        />
        <main className="content">{children}</main>
      </div>
      {navigationOpen ? (
        <MobileNavigationDialog
          closeLabel={labels.closeNavigation}
          currentPath={currentPath}
          items={navigationItems}
          navigationLabel={labels.navigation}
          onClose={() => setNavigationOpen(false)}
        />
      ) : null}
    </div>
  );
}
