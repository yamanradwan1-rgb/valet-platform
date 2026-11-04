import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { previewSchemaForLocation } from "./alert-model";

/** Provisional endpoint communicated by Prime; rollout remains disabled. */
export function readManagementAlertsPreview(
  api: DashboardApiClient,
  locationId: string,
  signal: AbortSignal,
  currentAuthority?: () => boolean,
) {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/alerts/preview`,
    previewSchemaForLocation(locationId),
    { signal, beforeTransport: currentAuthority },
  );
}
