import { sessionOverviewListResponseSchema } from "@valet/contracts";
import type { SessionOverviewEntry } from "@valet/contracts";

import { fetchOverviewPage, overviewListPath } from "../../lib/api/overview-endpoints";
import type { StaffApiClient } from "../../lib/api/staff-api-client";
import type { CursorPageFetcher } from "../../lib/api/use-cursor-list";

/**
 * Vehicles in Service list transport.
 *
 * GET /v1/staff/dashboard/locations/:locationId/overview/sessions
 * -> { items: SessionOverviewEntry[], nextCursor: string | null }
 *
 * The backend excludes COMPLETED sessions by contract; no completed-session
 * requests are ever constructed here. Cursors are opaque and echoed verbatim.
 */
export function createSessionsFetcher(
  client: StaffApiClient,
  locationId: string,
): CursorPageFetcher<SessionOverviewEntry> {
  const path = overviewListPath(locationId, "sessions");
  return async ({ cursor, signal }) => {
    const page = await fetchOverviewPage(
      client,
      path,
      sessionOverviewListResponseSchema,
      { cursor, signal },
    );
    return { items: page.items, nextCursor: page.nextCursor };
  };
}
