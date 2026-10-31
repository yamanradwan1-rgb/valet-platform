import {
  routeHistoryResponseSchema,
  taskRouteRecordingsResponseSchema,
} from "@valet/contracts";
import type { RouteHistoryResponse } from "@valet/contracts";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";

export type Sample = RouteHistoryResponse["samples"][number] & {
  readonly trackingSessionId: string;
};
export const routeWindowSize = 2000;

export function readTaskRecordings(
  api: DashboardApiClient,
  taskId: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  return api.request(
    `/v1/staff/tasks/${encodeURIComponent(taskId)}/route-history-recordings`,
    taskRouteRecordingsResponseSchema,
    { query: { limit: 100, cursor }, signal },
  );
}

/** A bounded window, never a silent truncation or unbounded automatic traversal. */
export async function readRouteWindow(
  api: DashboardApiClient,
  trackingSessionId: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  const samples: Sample[] = [];
  let nextCursor = cursor;
  let pages = 0;
  const seen = new Set<string>();
  if (cursor !== null) seen.add(cursor);
  do {
    signal.throwIfAborted();
    const result = await api.request(
      `/v1/staff/tracking-sessions/${encodeURIComponent(trackingSessionId)}/route-history`,
      routeHistoryResponseSchema,
      { query: { cursor: nextCursor, limit: 500 }, signal },
    );
    signal.throwIfAborted();
    samples.push(
      ...result.samples.map((sample) => ({ ...sample, trackingSessionId })),
    );
    pages += 1;
    nextCursor = result.nextCursor;
    if (
      nextCursor !== null &&
      (seen.has(nextCursor) || result.samples.length === 0)
    ) {
      throw new Error("Route pagination unavailable");
    }
    if (nextCursor !== null) seen.add(nextCursor);
  } while (
    nextCursor !== null &&
    pages < 4 &&
    samples.length < routeWindowSize
  );
  return { samples, nextCursor };
}
