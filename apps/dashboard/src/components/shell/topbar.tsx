import { ChevronDown, MapPin, Menu } from "lucide-react";
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
  locationControl,
  navigationOpen,
  onLocationSelect,
  onOpenNavigation,
  selectedLocation,
  themeControl,
}: {
  readonly accountControl?: ReactNode;
  readonly labels: DashboardShellLabels;
  readonly localeControl?: ReactNode;
  readonly locationControl?: ReactNode;
  readonly navigationOpen: boolean;
  readonly onLocationSelect: () => void;
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
        {locationControl ??
          (selectedLocation ? (
            <button
              aria-label={labels.changeScope}
              className="location-context"
              onClick={onLocationSelect}
              type="button"
            >
              <MapPin aria-hidden="true" size={18} />
              <bdi className="location-context-value">
                {selectedLocation.label}
              </bdi>
              <ChevronDown
                aria-hidden="true"
                className="location-context-chevron"
                size={14}
              />
            </button>
          ) : (
            <Button
              aria-label={labels.changeScope}
              onClick={onLocationSelect}
              type="button"
              variant="quiet"
            >
              {labels.changeScope}
            </Button>
          ))}
      </div>
      <div className="topbar-actions">
        {localeControl}
        {themeControl}
        {accountControl}
      </div>
    </header>
  );
}
