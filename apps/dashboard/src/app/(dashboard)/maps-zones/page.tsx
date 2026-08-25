"use client";

import { MapContainer } from "../../../components/maps/map-container";
import { FoundationPlaceholder } from "../../../components/ui/foundation-placeholder";

/**
 * Map Setup foundation. The D1 grid/schematic placeholder is NOT preserved;
 * this route renders the real provider-neutral map surface instead. Point and
 * area CRUD wiring arrives with the Map Setup integration task.
 */
export default function MapsZonesPage() {
  return (
    <div className="page-shell">
      <FoundationPlaceholder
        titleKey="page.mapsZones.title"
        descriptionKey="page.mapsZones.description"
      />
      <MapContainer ariaLabel="Map setup development map" />
    </div>
  );
}
