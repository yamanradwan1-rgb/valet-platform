import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  timingPreferencesSchema,
  validAlertTimingValues,
  type AlertTimingValues,
} from "./alert-timing-contract";

/** W2's approved location-scoped selector; server derives User from Staff session. */
function timingPath(organizationId: string, locationId: string): string {
  return `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/locations/${encodeURIComponent(locationId)}/alert-timing-preferences`;
}

export function readAlertTimingPreferences(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  signal?: AbortSignal,
) {
  return api.request(
    timingPath(organizationId, locationId),
    timingPreferencesSchema(organizationId),
    { signal },
  );
}

export function saveAlertTimingPreferences(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  expectedRevision: number,
  values: AlertTimingValues,
  signal?: AbortSignal,
) {
  if (
    !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
    !validAlertTimingValues(values)
  ) throw new Error("Invalid Management Alert Timing request.");
  return api.request(
    timingPath(organizationId, locationId),
    timingPreferencesSchema(organizationId),
    { method: "PUT", body: { expectedRevision, values }, signal },
  );
}
