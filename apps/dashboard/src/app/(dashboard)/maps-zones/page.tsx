"use client";

import { MapsZonesView } from "../../../features/map-setup/maps-zones-view";

/**
 * Map Setup route (D3-002). Real point/area CRUD against the backend
 * contracts reverified in apps/api/src/modules/map-setup; rendering goes
 * through the provider-neutral map abstraction. The former smoke-test
 * MapContainer mount is superseded by the feature's interactive surface.
 */
export default function MapsZonesPage() {
  return <MapsZonesView />;
}
