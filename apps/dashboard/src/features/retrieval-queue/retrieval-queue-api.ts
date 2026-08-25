import { retrievalQueueOverviewResponseSchema } from "@valet/contracts";
import type { RetrievalQueueEntry } from "@valet/contracts";

import { fetchOverviewPage, overviewListPath } from "../../lib/api/overview-endpoints";
import type { StaffApiClient } from "../../lib/api/staff-api-client";
import type { CursorPageFetcher } from "../../lib/api/use-cursor-list";

/**
 * Vehicle Retrieval Queue transport.
 *
 * GET /v1/staff/dashboard/locations/:locationId/overview/retrieval-queue
 * -> { items: RetrievalQueueEntry[], nextCursor: string | null }
 *
 * The backend returns only OPEN/ACCEPTED requests, oldest first, with the
 * current retrieval task facts (or null). No wait durations, queue positions,
 * ETAs or SLA data exist in this projection and none are requested.
 */
export function createRetrievalQueueFetcher(
  client: StaffApiClient,
  locationId: string,
): CursorPageFetcher<RetrievalQueueEntry> {
  const path = overviewListPath(locationId, "retrieval-queue");
  return async ({ cursor, signal }) => {
    const page = await fetchOverviewPage(
      client,
      path,
      retrievalQueueOverviewResponseSchema,
      { cursor, signal },
    );
    return { items: page.items, nextCursor: page.nextCursor };
  };
}
