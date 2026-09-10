/**
 * Live Vehicles directory copy (VUI-011C, DEC-066 §6–§12): truthful
 * operational read for one Location — capped-page notice, no search, no
 * fabricated values. Split from the alphabetical base dictionary so each
 * locale's authored file stays within the repository structure limits
 * (docs/17).
 */
export const nativeEmployeeEnglishVehiclesDictionary = {
  vehiclesCheckedInLabel: "Checked in",
  vehiclesDescriptorMissing: "Details pending",
  vehiclesDetailReadOnly:
    "Read-only view — actions stay in their own workflows.",
  vehiclesEmptyDetail:
    "Vehicles appear here while check-in, parking or retrieval is in progress.",
  vehiclesEmptyTitle: "No active vehicles right now",
  vehiclesLoadFailed: "The vehicle list could not be loaded.",
  vehiclesLoading: "Loading vehicles...",
  vehiclesRefreshing: "Refreshing...",
  vehiclesSubtitle: "Active vehicles currently at this location",
  vehiclesTruncatedNotice:
    "Showing the most recent active vehicles only. More vehicles may exist beyond this list.",
  vehiclesUpdatedAtLabel: "Updated",
} as const;
