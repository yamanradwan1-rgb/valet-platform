import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  readIncidents, readKeys, readLiveMap, readRetrievalQueue, readSessions, readStateCounts, readTasks,
} from "./operations-api";

const locationId = "22222222-2222-4222-8222-222222222222";

function api() {
  const request = vi.fn().mockResolvedValue({
    items: [], nextCursor: null, counts: [], observedAt: "2026-09-21T00:00:00Z",
  });
  return { client: { request } as unknown as DashboardApiClient, request };
}

describe("MD-03 read APIs", () => {
  it("maps every C8 read to exact Location overview routes with server cursors only", async () => {
    const { client, request } = api();
    await readSessions(client, locationId, "cursor_12345678");
    await readRetrievalQueue(client, locationId, null);
    await readTasks(client, locationId, null);
    await readKeys(client, locationId, null);
    await readIncidents(client, locationId, null);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      `/v1/staff/dashboard/locations/${locationId}/overview/sessions`,
      `/v1/staff/dashboard/locations/${locationId}/overview/retrieval-queue`,
      `/v1/staff/dashboard/locations/${locationId}/overview/tasks`,
      `/v1/staff/dashboard/locations/${locationId}/overview/keys`,
      `/v1/staff/dashboard/locations/${locationId}/overview/incidents`,
    ]);
    expect(request.mock.calls[0]?.[2]).toMatchObject({
      method: "GET", query: { limit: 50, cursor: "cursor_12345678" },
    });
    for (const call of request.mock.calls.slice(1)) {
      expect(call[2]).toMatchObject({ method: "GET", query: { limit: 50 } });
    }
  });

  it("uses aggregate state counts without pagination and live map with its own cursor", async () => {
    const { client, request } = api();
    await readStateCounts(client, locationId);
    await readLiveMap(client, locationId, "live_12345678");
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${locationId}/overview/session-state-counts`,
    );
    expect(request.mock.calls[0]?.[2]).toMatchObject({ method: "GET" });
    expect(request.mock.calls[1]?.[0]).toBe(
      `/v1/staff/locations/${locationId}/live-operations-map`,
    );
    expect(request.mock.calls[1]?.[2]).toMatchObject({
      method: "GET", query: { limit: 100, cursor: "live_12345678" },
    });
  });
});
