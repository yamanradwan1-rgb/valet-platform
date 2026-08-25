"use client";

import { FoundationPlaceholder } from "../../../components/ui/foundation-placeholder";
import { MapContainer } from "../../../components/maps/map-container";

/**
 * Live Operations foundation: renders the provider-neutral map smoke view
 * (MapLibre + OpenFreeMap, no API key). Real vehicle positions, freshness and
 * tracking wiring belong to a later task.
 */
export default function LiveOperationsPage() {
  return (
    <div className="page-shell">
      <FoundationPlaceholder
        titleKey="page.liveOperations.title"
        descriptionKey="page.liveOperations.description"
      />
      <MapContainer ariaLabel="Live operations development map" />
    </div>
  );
}
