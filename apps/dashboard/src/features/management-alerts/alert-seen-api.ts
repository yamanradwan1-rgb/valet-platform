import {
  managementAlertSeenResponseSchema,
  type ManagementAlertUnifiedItem,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

/** Explicit user intent ONLY, never invoked on bell open or automatic GET. */
export async function markManagementAlertOccurrenceSeen(
  api: DashboardApiClient,
  locationId: string,
  item: ManagementAlertUnifiedItem,
  currentAuthority: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  if (item.caseKind !== "OCCURRENCE") {
    throw new Error("Only committed occurrences can be marked Seen.");
  }
  const response = await api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/alerts/sources-unified/${encodeURIComponent(item.category)}/${encodeURIComponent(item.sourceId)}/seen`,
    managementAlertSeenResponseSchema,
    {
      method: "PUT",
      body: { episodeId: item.episodeId },
      beforeTransport: currentAuthority,
      signal,
    },
  );
  if (
    response.category !== item.category ||
    response.episodeId !== item.episodeId ||
    signal?.aborted === true ||
    !currentAuthority()
  ) {
    throw new Error("Seen response does not belong to the current source.");
  }
}
