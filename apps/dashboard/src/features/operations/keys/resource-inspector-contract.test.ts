import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readResourceInspectorOverview } from "./resource-inspector-contract";

// W3's schema is transport-owned. This focused test inspects the exact query
// assembled by W2 without inventing a resource/vehicle or mutating state.
vi.mock("@valet/contracts", () => ({
  physicalResourceOverviewResponseSchema: {},
  physicalResourceCustodyResponseSchema: {},
}));

describe("Issue #304 authoritative filtered resource overview requests", () => {
  it("sends both family filters for the first page without altering server totals", async () => {
    const response = {
      counts: { keySlots: { configured: 150 }, parkingSpots: { configured: 180 } },
      keySlots: { items: [], nextCursor: "cursor-key-page2" },
      parkingSpots: { items: [], nextCursor: null },
    };
    const request = vi.fn().mockResolvedValue(response);
    const api = { request } as unknown as DashboardApiClient;
    const signal = new AbortController().signal;
    const result = await readResourceInspectorOverview(
      api, "selected-location", null, null, "busy", "inactive", signal,
    );
    expect(result).toBe(response);
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/dashboard/locations/selected-location/physical-resources/overview",
      expect.anything(),
      {
        method: "GET",
        signal,
        query: { limit: 50, keyFilter: "busy", spotFilter: "inactive" },
      },
    );
  });

  it("keeps server filters on third-page cursor reads (no local-page-only filter)", async () => {
    const request = vi.fn().mockResolvedValue({ keySlots: { items: [] } });
    const api = { request } as unknown as DashboardApiClient;
    await readResourceInspectorOverview(
      api, "selected-location", "cursor-key-page3", null, "available", "busy",
      new AbortController().signal,
    );
    expect(request.mock.calls[0]?.[2].query).toEqual({
      limit: 50,
      keyCursor: "cursor-key-page3",
      keyFilter: "available",
      spotFilter: "busy",
    });
  });
});
