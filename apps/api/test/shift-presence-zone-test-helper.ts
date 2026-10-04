import type { ShiftPresenceZone } from "@valet/contracts";

/** Complete editable zone fields, excluding persisted scope/identity/revision. */
export function presenceZoneDraft(zone: ShiftPresenceZone) {
  return {
    code: zone.code,
    label: zone.label,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radiusMeters: zone.radiusMeters,
    state: zone.state,
  };
}
