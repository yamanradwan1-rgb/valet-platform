import { describe, expect, it } from "vitest";

import {
  FetchHarness,
  LOCATION_A,
  page,
} from "./live-operations-controller-test-support";

/**
 * Pagination and snapshot-time semantics of the Live Operations controller:
 * Load More cursor handling, refresh replacement, and the truthful
 * "observedAt = most recent successful server read" model (the backend
 * stamps every request freshly; cursors freeze no snapshot).
 */
describe("live operations pagination & snapshot semantics", () => {
  it("explicit refresh keeps visible rows on failure and marks refreshFailed", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(page(["t1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.refresh();
    expect(harness.latest.refreshing).toBe(true);
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t1",
    ]);
    harness.fetches[1]!.reject(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.refreshing).toBe(false);
    expect(harness.latest.refreshFailed).toBe(true);
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t1",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T10:00:00Z");
  });

  it("a successful refresh replaces rows with the fresh page one", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(page(["t1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.refresh();
    const refreshed = harness.fetches[1]!;
    expect(refreshed.params.cursor).toBeNull();
    refreshed.resolve(page(["t2"], null, "2026-01-01T11:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t2",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T11:00:00Z");
    expect(harness.latest.refreshFailed).toBe(false);
  });

  it("load more appends unique rows, adopts the cursor and advances observedAt", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(
      page(["t1"], "cursor-page-2", "2026-01-01T10:00:00Z"),
    );
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.loadMore();
    const more = harness.fetches[1]!;
    expect(more.params.cursor).toBe("cursor-page-2");
    // The backend stamps each request freshly, so page 2 legitimately carries
    // its own later observation time; the UI exposes that latest read.
    more.resolve(page(["t1", "t2"], null, "2026-01-01T10:05:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t1",
      "t2",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T10:05:00Z");
    expect(harness.latest.nextCursor).toBeNull();
  });

  it("a failed load more keeps rows, exact cursor and last observation time", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(
      page(["t1"], "cursor-page-2", "2026-01-01T10:00:00Z"),
    );
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.loadMore();
    harness.controller.loadMore(); // collapsed while one page is running
    expect(harness.fetches).toHaveLength(2);
    harness.fetches[1]!.reject(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.moreError).toBe(true);
    expect(harness.latest.nextCursor).toBe("cursor-page-2");
    expect(harness.latest.observedAt).toBe("2026-01-01T10:00:00Z");
    // Retry re-requests exactly the failed cursor.
    harness.controller.loadMore();
    expect(harness.fetches[2]?.params.cursor).toBe("cursor-page-2");
  });

  it("load more is blocked while an initial load or refresh is in flight", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.controller.loadMore(); // initial still running
    expect(harness.fetches).toHaveLength(1);
    harness.fetches[0]!.resolve(page(["t1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.refresh();
    harness.controller.loadMore(); // refresh running
    expect(harness.fetches).toHaveLength(2);
  });

  it("refresh while a Load More request is active cannot corrupt state", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(
      page(["t1"], "cursor-page-2", "2026-01-01T10:00:00Z"),
    );
    await Promise.resolve();
    await Promise.resolve();
    harness.controller.loadMore();
    const pendingMore = harness.fetches[1]!;
    harness.controller.refresh(); // supersedes the running page request
    expect(pendingMore.signal.aborted).toBe(true);
    const refreshRequest = harness.fetches[2]!;
    expect(refreshRequest.params.cursor).toBeNull();
    // The aborted page's late resolution must be dropped wholesale.
    pendingMore.resolve(page(["t1", "ghost"], null, "2026-01-01T10:30:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t1",
    ]);
    refreshRequest.resolve(page(["fresh"], null, "2026-01-01T11:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "fresh",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T11:00:00Z");
  });
});
