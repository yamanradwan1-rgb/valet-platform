"use client";

import { useDashboardLocations } from "../../features/location/location-context";
import { authorizedLocationLabels } from "../../features/location/location-labels";
import { useTranslation } from "../../i18n/locale-provider";

/**
 * D2-005 location context in the existing top bar.
 *
 * - zero/one authorized location: static context label — no fake choice is
 *   rendered when there is nothing to choose;
 * - multiple authorized locations: a keyboard-accessible native select whose
 *   options are EXACTLY the backend-authorized list (never arbitrary ids),
 *   with human-readable names and truthful id-based disambiguation for
 *   duplicate names.
 *
 * Loading/error/zero-access states never reach the shell: LocationGate keeps
 * them outside the operational dashboard.
 */
export function LocationSwitcher() {
  const { t } = useTranslation();
  const { status, locations, location, selectLocation } =
    useDashboardLocations();

  if (status !== "ready" || location === null) {
    // Defensive only; the gate renders these states before any shell mounts.
    return (
      <div className="topbar-location is-unset">
        <span className="topbar-location-dot" aria-hidden="true" />
        <span className="topbar-location-label">
          {t("location.loadingLocations")}
        </span>
      </div>
    );
  }

  if (locations.length <= 1) {
    return (
      <div className="topbar-location">
        <span className="topbar-location-dot" aria-hidden="true" />
        <span className="topbar-location-label">{location.name}</span>
        <span className="topbar-location-currency">{location.currency}</span>
      </div>
    );
  }

  const labels = authorizedLocationLabels(locations);

  function onSelectionChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    selectLocation(event.target.value);
  }

  return (
    <div className="topbar-location">
      <span className="topbar-location-dot" aria-hidden="true" />
      <select
        className="topbar-location-select"
        value={location.locationId}
        onChange={onSelectionChange}
        aria-label={t("location.selectorLabel")}
      >
        {locations.map((entry) => (
          <option key={entry.locationId} value={entry.locationId}>
            {labels.get(entry.locationId) ?? entry.name}
          </option>
        ))}
      </select>
      <span className="topbar-location-currency">{location.currency}</span>
    </div>
  );
}
