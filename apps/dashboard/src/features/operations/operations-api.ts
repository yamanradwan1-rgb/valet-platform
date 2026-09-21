import {
  incidentOverviewResponseSchema,
  keySlotOverviewResponseSchema,
  liveOperationsMapResponseSchema,
  retrievalQueueOverviewResponseSchema,
  sessionOverviewListResponseSchema,
  sessionStateCountsResponseSchema,
  taskOverviewListResponseSchema,
  type IncidentOverviewEntry,
  type KeySlotOverviewEntry,
  type LiveOperationsMapResponse,
  type RetrievalQueueEntry,
  type SessionOverviewEntry,
  type SessionStateCountsResponse,
  type TaskOverviewEntry,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

function overviewPath(locationId: string, suffix: string) {
  return `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/overview/${suffix}`;
}

function list<T>(
  api: DashboardApiClient,
  locationId: string,
  suffix: string,
  schema: Parameters<DashboardApiClient["request"]>[1],
  cursor: string | null,
  signal?: AbortSignal,
): Promise<T> {
  return api.request(overviewPath(locationId, suffix), schema as never, {
    method: "GET",
    query: { limit: 50, ...(cursor === null ? {} : { cursor }) },
    signal,
  }) as Promise<T>;
}

export function readSessions(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CursorPage<SessionOverviewEntry>> {
  return list(api, locationId, "sessions", sessionOverviewListResponseSchema, cursor, signal);
}

export function readStateCounts(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<SessionStateCountsResponse> {
  return api.request(
    overviewPath(locationId, "session-state-counts"),
    sessionStateCountsResponseSchema,
    { method: "GET", signal },
  );
}

export function readRetrievalQueue(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CursorPage<RetrievalQueueEntry>> {
  return list(api, locationId, "retrieval-queue", retrievalQueueOverviewResponseSchema, cursor, signal);
}

export function readTasks(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CursorPage<TaskOverviewEntry>> {
  return list(api, locationId, "tasks", taskOverviewListResponseSchema, cursor, signal);
}

export function readKeys(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CursorPage<KeySlotOverviewEntry>> {
  return list(api, locationId, "keys", keySlotOverviewResponseSchema, cursor, signal);
}

export function readIncidents(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CursorPage<IncidentOverviewEntry>> {
  return list(api, locationId, "incidents", incidentOverviewResponseSchema, cursor, signal);
}

export function readLiveMap(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<LiveOperationsMapResponse> {
  return api.request(
    `/v1/staff/locations/${encodeURIComponent(locationId)}/live-operations-map`,
    liveOperationsMapResponseSchema,
    {
      method: "GET",
      query: { limit: 100, ...(cursor === null ? {} : { cursor }) },
      signal,
    },
  );
}
