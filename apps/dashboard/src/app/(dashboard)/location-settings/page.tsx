"use client";

import { LocationSettingsView } from "../../../features/location-settings/location-settings-view";

/**
 * Location Settings route (D4-003). Real typed Location Configuration
 * against the backend contracts reverified in
 * apps/api/src/modules/dashboard/dashboard-configuration.controller.ts,
 * replacing the former foundation placeholder.
 */
export default function Page() {
  return <LocationSettingsView />;
}
