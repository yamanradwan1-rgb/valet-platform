import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { readRouteWindow } from "./route-history-api";

const sample = {
  capturedAt: "2026-10-31T12:00:00Z",
  latitude: 31,
  longitude: 35,
};
const tracker = "11111111-1111-4111-8111-111111111111";

describe("bounded real route loading", () => {
  it("keeps a maximum 2,000 point window and exposes its next cursor", async () => {
    const request = vi.fn().mockResolvedValue({
      samples: Array(500).fill(sample),
      nextCursor: "next",
    });
    let page = 0;
    request.mockImplementation(async () => ({
      samples: Array(500).fill(sample),
      nextCursor: `page-${++page}`,
    }));
    const result = await readRouteWindow(
      { request } as unknown as DashboardApiClient,
      tracker,
      null,
      new AbortController().signal,
    );
    expect(result.samples).toHaveLength(2000);
    expect(result.nextCursor).toBe("page-4");
    expect(request).toHaveBeenCalledTimes(4);
    expect(result.samples.every((p) => p.trackingSessionId === tracker)).toBe(
      true,
    );
  });
  it("never publishes partial coordinates after a failed later page", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ samples: [sample], nextCursor: "second" })
      .mockRejectedValueOnce(new Error("Denied"));
    await expect(
      readRouteWindow(
        { request } as unknown as DashboardApiClient,
        tracker,
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Denied");
  });
  it("bounds automatic requests even when each page has one observation", async () => {
    let page = 0;
    const request = vi.fn(async () => ({
      samples: [sample],
      nextCursor: `sparse-${++page}`,
    }));
    const result = await readRouteWindow(
      { request } as unknown as DashboardApiClient,
      tracker,
      null,
      new AbortController().signal,
    );
    expect(request).toHaveBeenCalledTimes(4);
    expect(result.samples).toHaveLength(4);
    expect(result.nextCursor).toBe("sparse-4");
  });
  it("stops before network work on cancellation and rejects a cursor cycle", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ samples: [sample], nextCursor: "repeat" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      readRouteWindow(
        { request } as unknown as DashboardApiClient,
        tracker,
        null,
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await expect(
      readRouteWindow(
        { request } as unknown as DashboardApiClient,
        tracker,
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow("pagination unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
