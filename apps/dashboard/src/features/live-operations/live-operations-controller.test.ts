import { describe, expect, it } from "vitest";

import {
  FetchHarness,
  LOCATION_A,
  LOCATION_B,
  page,
} from "./live-operations-controller-test-support";

/**
 * Location-identity and request-lifecycle behavior of the Live Operations
 * controller. Pagination/snapshot semantics live in
 * live-operations-pagination.test.ts.
 */
describe("live operations controller — location identity & lifecycle", () => {
  it("applies the first accepted snapshot with its observedAt", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    const pending = harness.fetches[0]!;
    expect(pending.params.locationId).toBe(LOCATION_A);
    expect(pending.params.cursor).toBeNull();
    pending.resolve(page(["t1", "t2"], "cursor-1", "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "t1",
      "t2",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T10:00:00Z");
    expect(harness.latest.nextCursor).toBe("cursor-1");
  });

  it("a late Location A response can never overwrite Location B", async () => {
    const harness = new FetchHarness();
    // 1. Location A load begins (still in flight).
    harness.controller.load(LOCATION_A);
    const requestA = harness.fetches[0]!;
    // 2. Request identity changes to Location B.
    harness.controller.load(LOCATION_B);
    // A's in-flight request is aborted as part of the identity change...
    expect(requestA.signal.aborted).toBe(true);
    // ...and old list/pagination/snapshot state disappears immediately.
    expect(harness.latest.items).toHaveLength(0);
    expect(harness.latest.observedAt).toBeNull();
    expect(harness.latest.nextCursor).toBeNull();
    expect(harness.latest.refreshFailed).toBe(false);
    expect(harness.latest.phase).toBe("loading");
    // 3. B begins from page 1 — the stale A cursor can never be used for B.
    const requestB = harness.fetches[1]!;
    expect(requestB.params.locationId).toBe(LOCATION_B);
    expect(requestB.params.cursor).toBeNull();
    // 4. The late A resolution is dropped wholesale.
    requestA.resolve(page(["A-1"], "stale-cursor", "2026-01-01T09:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items).toHaveLength(0);
    expect(harness.latest.observedAt).toBeNull();
    // 5. B data remains authoritative.
    requestB.resolve(page(["B-1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "B-1",
    ]);
    expect(harness.latest.observedAt).toBe("2026-01-01T10:00:00Z");
    expect(harness.latest.nextCursor).toBeNull();
    for (const snapshot of harness.snapshots) {
      for (const item of snapshot.items) {
        expect(item.trackingSessionId).not.toBe("A-1");
      }
    }
  });

  it("switching locations resets rows, cursor, observedAt and refresh-error state", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.resolve(
      page(["A-1"], "cursor-A-page-2", "2026-01-01T09:00:00Z"),
    );
    await Promise.resolve();
    await Promise.resolve();
    // Simulate a refresh failure so refreshFailed is set before the switch.
    harness.controller.refresh();
    harness.fetches[1]!.reject(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.refreshFailed).toBe(true);
    expect(harness.latest.items).toHaveLength(1);

    harness.controller.load(LOCATION_B);
    // Old-location rows/markers data disappear immediately...
    expect(harness.latest.items).toHaveLength(0);
    expect(harness.latest.observedAt).toBeNull();
    expect(harness.latest.nextCursor).toBeNull();
    expect(harness.latest.refreshFailed).toBe(false);
    expect(harness.latest.moreError).toBe(false);
    expect(harness.latest.phase).toBe("loading");
    // ...and B restarts from page 1.
    const requestB = harness.fetches.at(-1)!;
    expect(requestB.params.locationId).toBe(LOCATION_B);
    expect(requestB.params.cursor).toBeNull();
    requestB.resolve(page(["B-1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "B-1",
    ]);
  });

  it("an aborted response arriving after a superseding sequence is ignored", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    const first = harness.fetches[0]!;
    harness.controller.load(LOCATION_A); // retry supersedes sequence 1
    const second = harness.fetches[1]!;
    first.resolve(page(["old"], null, "2026-01-01T08:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items).toHaveLength(0);
    second.resolve(page(["new"], null, "2026-01-01T09:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.items.map((item) => item.trackingSessionId)).toEqual([
      "new",
    ]);
  });

  it("initial failures surface an error state and retry reloads the same location", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    harness.fetches[0]!.reject(new Error("network down"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.phase).toBe("error");
    expect(harness.latest.error).toBeInstanceOf(Error);
    harness.controller.retry();
    const retryRequest = harness.fetches[1]!;
    expect(retryRequest.params.locationId).toBe(LOCATION_A);
    expect(retryRequest.params.cursor).toBeNull();
    retryRequest.resolve(page(["t1"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.latest.phase).toBe("ready");
  });

  it("dispose aborts the in-flight request and stops all emissions", async () => {
    const harness = new FetchHarness();
    harness.controller.load(LOCATION_A);
    const pending = harness.fetches[0]!;
    harness.controller.dispose();
    expect(pending.signal.aborted).toBe(true);
    const emissionsAtDispose = harness.snapshots.length;
    pending.resolve(page(["late"], null, "2026-01-01T10:00:00Z"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.snapshots).toHaveLength(emissionsAtDispose);
  });
});
