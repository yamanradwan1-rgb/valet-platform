import { Building2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import type { DashboardNavigationItem } from "../../lib/navigation";
import { VayletLogo } from "../brand/vaylet-logo";
import { Button } from "../presentation/button";
import { NavigationList } from "./navigation-list";
import type { DashboardScopeReference } from "./shell-types";

export function DashboardSidebar({
  collapsed,
  changeScopeLabel,
  collapseLabel,
  currentPath,
  expandLabel,
  items,
  navigationLabel,
  onOrganizationSelect,
  onToggleCollapsed,
  organizationLabel,
  selectedOrganization,
}: {
  readonly collapsed: boolean;
  readonly changeScopeLabel: string;
  readonly collapseLabel: string;
  readonly currentPath: string;
  readonly expandLabel: string;
  readonly items: readonly DashboardNavigationItem[];
  readonly navigationLabel: string;
  readonly onOrganizationSelect: () => void;
  readonly onToggleCollapsed: () => void;
  readonly organizationLabel: string;
  readonly selectedOrganization: DashboardScopeReference | null;
}) {
  const mainItems = items.filter((item) => item.placement === "MAIN");
  const utilityItems = items.filter((item) => item.placement === "UTILITY");

  return (
    <aside className="sidebar" data-collapsed={collapsed ? "true" : "false"}>
      <div className="sidebar-brand">
        <VayletLogo collapsed={collapsed} />
      </div>
      {selectedOrganization ? (
        <button
          aria-label={`${organizationLabel}: ${selectedOrganization.label}. ${changeScopeLabel}`}
          className="sidebar-scope"
          onClick={onOrganizationSelect}
          type="button"
        >
          <Building2 aria-hidden="true" className="sidebar-scope-icon" size={18} />
          <bdi className="sidebar-scope-value">{selectedOrganization.label}</bdi>
          <ChevronDown aria-hidden="true" className="sidebar-scope-chevron" size={14} />
        </button>
      ) : null}
      <div className="sidebar-navigation">
        <NavigationList
          currentPath={currentPath}
          items={mainItems}
          label={navigationLabel}
        />
      </div>
      <div className="sidebar-utilities">
        <NavigationList
          currentPath={currentPath}
          items={utilityItems}
          label={navigationLabel}
        />
        <Button
          aria-label={collapsed ? expandLabel : collapseLabel}
          className="sidebar-collapse"
          onClick={onToggleCollapsed}
          type="button"
          variant="quiet"
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" size={16} />
          ) : (
            <ChevronLeft aria-hidden="true" size={16} />
          )}
          <span className="nav-label">{collapsed ? expandLabel : collapseLabel}</span>
        </Button>
      </div>
    </aside>
  );
}
