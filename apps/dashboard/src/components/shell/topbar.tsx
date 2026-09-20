import type { ReactNode } from "react";

import { Button } from "../presentation/button";
import type {
  DashboardScopeReference,
  DashboardShellLabels,
} from "./shell-types";

function ScopeChip({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <span className="scope-chip">
      {label}: <bdi>{value}</bdi>
    </span>
  );
}

export function DashboardTopbar({
  accountControl,
  labels,
  localeControl,
  locationSelector,
  navigationOpen,
  onOpenNavigation,
  organizationSelector,
  selectedLocation,
  selectedOrganization,
  themeControl,
}: {
  readonly accountControl?: ReactNode;
  readonly labels: DashboardShellLabels;
  readonly localeControl?: ReactNode;
  readonly locationSelector?: ReactNode;
  readonly navigationOpen: boolean;
  readonly onOpenNavigation: () => void;
  readonly organizationSelector?: ReactNode;
  readonly selectedLocation: DashboardScopeReference | null;
  readonly selectedOrganization: DashboardScopeReference | null;
  readonly themeControl?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="scope-line">
        <Button
          aria-expanded={navigationOpen}
          aria-haspopup="dialog"
          aria-label={labels.openNavigation}
          className="mobile-menu"
          onClick={onOpenNavigation}
          type="button"
          variant="quiet"
        >
          ☰
        </Button>
        {selectedOrganization ? (
          <ScopeChip
            label={labels.organization}
            value={selectedOrganization.label}
          />
        ) : null}
        {selectedLocation ? (
          <ScopeChip label={labels.location} value={selectedLocation.label} />
        ) : null}
        {organizationSelector}
        {locationSelector}
      </div>
      <div className="topbar-actions">
        {localeControl}
        {themeControl}
        {accountControl}
      </div>
    </header>
  );
}
