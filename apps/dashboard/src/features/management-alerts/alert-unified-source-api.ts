import {
  managementAlertUnifiedSourceDetailResponseSchema,
  type ManagementAlertUnifiedItem,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

/** Exact navigation is a fresh authorized server read, not an ID-based grant. */
export async function readUnifiedManagementAlertDetail(
  api: DashboardApiClient,
  locationId: string,
  item: ManagementAlertUnifiedItem,
  signal: AbortSignal,
  currentAuthority: () => boolean,
) {
  const result = await api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/alerts/sources-unified/${encodeURIComponent(item.category)}/${encodeURIComponent(item.sourceId)}`,
    managementAlertUnifiedSourceDetailResponseSchema,
    {
      signal,
      query: { episodeId: item.episodeId },
      beforeTransport: currentAuthority,
    },
  );
  if (
    result.item.category !== item.category ||
    result.item.sourceId !== item.sourceId ||
    result.item.episodeId !== item.episodeId ||
    !currentAuthority()
  ) {
    throw new Error("Stale or mismatched exact alert source.");
  }
  return result;
}
