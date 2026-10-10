import { liveSessionOverviewListResponseSchema } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readLiveSessions, readSessions } from "../operations-api";

const locationId = "22222222-2222-4222-8222-222222222222";

describe("#276 purpose-specific Live sessions read", () => {
  it("uses a separate strict Live-only endpoint and leaves Vehicles sessions untouched", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const api = { request } as unknown as DashboardApiClient;
    const signal = new AbortController().signal;
    await readLiveSessions(api, locationId, "live_cursor", signal, "PARKED");
    await readSessions(api, locationId, null, signal);
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${locationId}/overview/live-sessions`,
    );
    expect(request.mock.calls[0]?.[1]).toBe(
      liveSessionOverviewListResponseSchema,
    );
    expect(request.mock.calls[0]?.[2]).toEqual({
      method: "GET",
      query: { limit: 50, filter: "PARKED", cursor: "live_cursor" },
      signal,
    });
    expect(request.mock.calls[1]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${locationId}/overview/sessions`,
    );
    expect(request.mock.calls[1]?.[1]).not.toBe(
      liveSessionOverviewListResponseSchema,
    );
  });
});
