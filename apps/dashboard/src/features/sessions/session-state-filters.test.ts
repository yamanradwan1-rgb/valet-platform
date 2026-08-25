import { describe, expect, it } from "vitest";

import { canLoadMore, initialPageLoaded, pageAppended } from "../../lib/api/cursor-list-reducer";
import {
  applySessionStateFilter,
  isSessionStateFilterValue,
  SESSION_STATE_FILTER_OPTIONS,
} from "./session-state-filters";

interface Row {
  readonly id: string;
  readonly state: string;
}

function row(id: string, state: string): Row {
  return { id, state };
}

describe("sessions state filter model", () => {
  it("never offers COMPLETED as a filter option", () => {
    expect(SESSION_STATE_FILTER_OPTIONS).not.toContain("COMPLETED");
  });

  it("offers ALL plus exactly the eight backend-supported active states", () => {
    expect(SESSION_STATE_FILTER_OPTIONS).toEqual([
      "ALL",
      "CHECKING_IN",
      "AWAITING_PARKING",
      "PARKING",
      "PARKED",
      "REQUESTED",
      "RETRIEVING",
      "READY",
      "HANDOFF_PENDING",
    ]);
  });

  it("keeps every option type-safe", () => {
    for (const option of SESSION_STATE_FILTER_OPTIONS) {
      expect(isSessionStateFilterValue(option)).toBe(true);
    }
    expect(isSessionStateFilterValue("COMPLETED")).toBe(false);
    expect(isSessionStateFilterValue("NOT_A_STATE")).toBe(false);
  });

  it("returns all rows unchanged for the ALL filter", () => {
    const rows = [row("a", "PARKED"), row("b", "PARKING")];
    expect(applySessionStateFilter(rows, "ALL")).toEqual(rows);
  });

  it("narrows loaded rows by the selected state", () => {
    const rows = [
      row("a", "PARKED"),
      row("b", "PARKING"),
      row("c", "PARKED"),
    ];
    const filtered = applySessionStateFilter(rows, "PARKED");
    expect(filtered.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("yields an empty result honestly when no loaded row matches", () => {
    const rows = [row("a", "CHECKING_IN")];
    expect(applySessionStateFilter(rows, "READY")).toEqual([]);
  });

  it("keeps Load More available when a zero-match filter is active", () => {
    // Zero filtered rows must never be read as "no such sessions exist" while
    // the backend still holds more pages: availability follows nextCursor.
    const snapshot = initialPageLoaded(
      { items: [row("a", "PARKED")], nextCursor: "cursor-page-2" },
      (item) => item.id,
    );
    expect(applySessionStateFilter(snapshot.items, "READY")).toEqual([]);
    expect(canLoadMore(snapshot)).toBe(true);
  });

  it("re-applies the client filter over appended backend pages", () => {
    const first = initialPageLoaded(
      { items: [row("a", "PARKED"), row("b", "RETRIEVING")], nextCursor: "c2" },
      (item) => item.id,
    );
    expect(applySessionStateFilter(first.items, "READY")).toEqual([]);

    const second = pageAppended(
      first,
      { items: [row("c", "READY"), row("d", "PARKED")], nextCursor: null },
      (item) => item.id,
    );
    const ready = applySessionStateFilter(second.items, "READY");
    expect(ready.map((item) => item.id)).toEqual(["c"]);
    expect(canLoadMore(second)).toBe(false);
  });

  it("never lets a filter change touch the pagination cursor", () => {
    const snapshot = initialPageLoaded(
      { items: [row("a", "PARKED")], nextCursor: "cursor-2" },
      (item) => item.id,
    );
    for (const option of SESSION_STATE_FILTER_OPTIONS) {
      applySessionStateFilter(snapshot.items, option);
      expect(snapshot.nextCursor).toBe("cursor-2");
    }
  });
});
