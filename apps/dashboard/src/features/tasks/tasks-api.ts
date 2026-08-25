import { taskOverviewListResponseSchema } from "@valet/contracts";
import type { TaskOverviewEntry } from "@valet/contracts";

import { fetchOverviewPage, overviewListPath } from "../../lib/api/overview-endpoints";
import type { StaffApiClient } from "../../lib/api/staff-api-client";
import type { CursorPageFetcher } from "../../lib/api/use-cursor-list";

/**
 * Tasks list transport.
 *
 * GET /v1/staff/dashboard/locations/:locationId/overview/tasks
 * -> { items: TaskOverviewEntry[], nextCursor: string | null }
 *
 * Read-only current-task-facts projection. Assignment/dispatch history is not
 * part of this contract and is never reconstructed here; no mutation actions
 * are exposed by the Management Dashboard backend for these routes.
 */
export function createTasksFetcher(
  client: StaffApiClient,
  locationId: string,
): CursorPageFetcher<TaskOverviewEntry> {
  const path = overviewListPath(locationId, "tasks");
  return async ({ cursor, signal }) => {
    const page = await fetchOverviewPage(
      client,
      path,
      taskOverviewListResponseSchema,
      { cursor, signal },
    );
    return { items: page.items, nextCursor: page.nextCursor };
  };
}
