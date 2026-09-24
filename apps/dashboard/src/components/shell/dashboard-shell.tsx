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
  navigationItems,
  onLocationSelect,
  onOrganizationSelect,
  selectedLocation,
  selectedOrganization,
  themeControl,
}: DashboardShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="shell"
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
    >
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        collapseLabel={labels.collapseNavigation}
        currentPath={currentPath}
        expandLabel={labels.expandNavigation}
        items={navigationItems}
        navigationLabel={labels.navigation}
        onOrganizationSelect={onOrganizationSelect}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        changeScopeLabel={labels.changeScope}
        organizationLabel={labels.organization}
        selectedOrganization={selectedOrganization}
      />
      <div className="shell-main">
        <DashboardTopbar
          accountControl={accountControl}
          labels={labels}
          localeControl={localeControl}
          navigationOpen={navigationOpen}
          onLocationSelect={onLocationSelect}
          onOpenNavigation={() => setNavigationOpen(true)}
          selectedLocation={selectedLocation}
          themeControl={themeControl}
        />
        <main className="content">
          <div className="content-inner">{children}</div>
        </main>
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
