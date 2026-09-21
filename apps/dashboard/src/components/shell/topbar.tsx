import { MapPin, Menu } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../presentation/button";
import type {
  DashboardScopeReference,
  DashboardShellLabels,
} from "./shell-types";

export function DashboardTopbar({
  accountControl,
  labels,
  localeControl,
  locationSelector,
  navigationOpen,
  onOpenNavigation,
  selectedLocation,
  themeControl,
}: {
  readonly accountControl?: ReactNode;
  readonly labels: DashboardShellLabels;
  readonly localeControl?: ReactNode;
  readonly locationSelector?: ReactNode;
  readonly navigationOpen: boolean;
  readonly onOpenNavigation: () => void;
  readonly selectedLocation: DashboardScopeReference | null;
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
          <Menu aria-hidden="true" size={20} />
        </Button>
        {selectedLocation ? (
          <div className="location-context">
            <MapPin aria-hidden="true" size={18} />
            <div className="location-context-copy">
              <span className="location-context-label">{labels.location}</span>
              <bdi className="location-context-value">{selectedLocation.label}</bdi>
            </div>
          </div>
        ) : null}
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
