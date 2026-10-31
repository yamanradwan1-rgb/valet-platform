import type { Scalar } from "./catalog";
import {
  defaultValues,
  fixtureZones,
  locationKey,
  locations,
  savedOverrides,
  type LocalStore,
  type Zone,
} from "./fixtures";

export function localZones(
  store: LocalStore,
  org: string,
  location: string,
): Zone[] {
  return (
    store.zones[locationKey(org, location)] ??
    (location === "garden" ? fixtureZones : [])
  );
}

export function localPresenceReadiness(
  store: LocalStore,
  org: string,
  location: string,
  zones = localZones(store, org, location),
) {
  const defaults = defaultValues(store, org);
  const overrides = savedOverrides(store, org, location);
  const start =
    overrides.shiftStartPresenceMode ?? defaults.shiftStartPresenceMode;
  const end = overrides.shiftEndPresenceMode ?? defaults.shiftEndPresenceMode;
  const strict = [start, end].some(
    (value) => value === "REQUIRE" || value === "REQUIRE_OR_OVERRIDE",
  );
  const usable = zones.some(
    (zone) =>
      zone.status === "ACTIVE" &&
      Number.isFinite(zone.latitude) &&
      Math.abs(zone.latitude) <= 90 &&
      Number.isFinite(zone.longitude) &&
      Math.abs(zone.longitude) <= 180 &&
      Number.isFinite(zone.radius) &&
      zone.radius >= 5 &&
      zone.radius <= 1000,
  );
  return {
    strict,
    usable,
    activeZones: zones.filter((zone) => zone.status === "ACTIVE").length,
    inactive: start === "OFF" && end === "OFF",
    allowed: !strict || usable,
  };
}

export function allowsLocalPresenceChange(
  store: LocalStore,
  org: string,
  location: string | null,
  key: string,
  value: Scalar,
  clear: boolean,
) {
  const scope = location ? locationKey(org, location) : `${org}:company`;
  const next = {
    ...store,
    settings: {
      ...store.settings,
      [scope]: { ...store.settings[scope], [key]: clear ? null : value },
    },
  };
  const targets = location ? [location] : locations.map((item) => item.id);
  return targets.every(
    (target) => localPresenceReadiness(next, org, target).allowed,
  );
}
