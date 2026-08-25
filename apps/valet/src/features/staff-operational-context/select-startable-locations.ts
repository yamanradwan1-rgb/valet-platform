import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
} from "@valet/contracts";

/**
 * VUI-011D: startable Locations derive exclusively from the authoritative
 * operational-context eligibleLocations projection (server-derived,
 * membership-scoped per DEC-033). Nothing here authorizes a start by itself;
 * the server re-proves membership/location authority on every command.
 *
 * Membership contexts are deduplicated by Location ID because one employee
 * may hold several memberships that legitimately overlap on one Location.
 */
export function selectStartableLocations(
  response: StaffOperationalContextResponse | null | undefined,
): StaffOperationalLocation[] {
  const seen = new Set<string>();
  const out: StaffOperationalLocation[] = [];
  for (const context of response?.contexts ?? []) {
    for (const location of context.eligibleLocations) {
      if (!seen.has(location.locationId)) {
        seen.add(location.locationId);
        out.push(location);
      }
    }
  }
  return out;
}
