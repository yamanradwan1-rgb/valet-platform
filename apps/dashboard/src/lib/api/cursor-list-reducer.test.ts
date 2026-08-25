import { describe, expect, it } from "vitest";

import {
  canLoadMore,
  emptyCursorList,
  initialLoadFailed,
  initialPageLoaded,
  loadMoreFailed,
  loadMoreStarted,
  pageAppended,
  type CursorPage,
} from "./cursor-list-reducer";

interface Row {
  readonly id: string;
}

function keyOf(item: Row): string {
  return item.id;
}

function page(ids: string[], nextCursor: string | null): CursorPage<Row> {
  return { items: ids.map((id) => ({ id })), nextCursor };
}

describe("cursor list state machine", () => {
  it("starts in a loading phase with no rows and no cursor", () => {
    const snapshot = emptyCursorList<Row>();
    expect(snapshot.phase).toBe("loading");
    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.nextCursor).toBeNull();
    expect(canLoadMore(snapshot)).toBe(false);
  });

  it("adopts the first page and exposes exhaustion through nextCursor", () => {
    const loaded = initialPageLoaded(page(["a", "b"], null), keyOf);
    expect(loaded.phase).toBe("ready");
    expect(loaded.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(loaded.nextCursor).toBeNull();
    expect(canLoadMore(loaded)).toBe(false);
  });

  it("allows Load More only while ready, idle, and holding a cursor", () => {
    expect(canLoadMore(initialPageLoaded(page(["a"], "c1"), keyOf))).toBe(true);
    expect(
      canLoadMore(loadMoreStarted(initialPageLoaded(page(["a"], "c1"), keyOf))),
    ).toBe(false);
    expect(canLoadMore(emptyCursorList<Row>())).toBe(false);
    expect(canLoadMore(initialLoadFailed<Row>())).toBe(false);
  });

  it("appends follow-up pages without duplicating existing rows", () => {
    const first = initialPageLoaded(page(["a", "b"], "c1"), keyOf);
    const appended = pageAppended(first, page(["b", "c", "d"], "c2"), keyOf);
    expect(appended.items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(appended.nextCursor).toBe("c2");
    expect(appended.loadingMore).toBe(false);
    expect(appended.moreError).toBe(false);
  });

  it("keeps the already-loaded version when a duplicate id arrives later", () => {
    const first = initialPageLoaded(page(["a"], "c1"), keyOf);
    const staleDuplicate = { id: "a" };
    const appended = pageAppended(
      first,
      { items: [staleDuplicate], nextCursor: null },
      keyOf,
    );
    // The row loaded earlier stays authoritative; the incoming duplicate is
    // dropped rather than silently replacing it.
    expect(appended.items).toHaveLength(1);
    expect(appended.items[0]).toBe(first.items[0]);
    expect(appended.items[0]).not.toBe(staleDuplicate);
  });

  it("keeps an exhausted list exhausted when another page arrives late", () => {
    const exhausted = { ...initialPageLoaded(page(["a"], null), keyOf) };
    const after = pageAppended(exhausted, page(["b"], "ignored"), keyOf);
    expect(after.items.map((item) => item.id)).toEqual(["a"]);
    expect(after.nextCursor).toBeNull();
  });

  it("preserves loaded rows and the intended cursor when a page fails", () => {
    const first = initialPageLoaded(page(["a", "b"], "cursor-2"), keyOf);
    const started = loadMoreStarted(first);
    const failed = loadMoreFailed(started);
    expect(failed.moreError).toBe(true);
    expect(failed.loadingMore).toBe(false);
    expect(failed.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(failed.nextCursor).toBe("cursor-2");
    expect(canLoadMore(failed)).toBe(true);
  });

  it("never mutates the previous snapshot (stale renders stay consistent)", () => {
    const first = initialPageLoaded(page(["a"], "c1"), keyOf);
    const appended = pageAppended(first, page(["b"], "c2"), keyOf);
    expect(first.items.map((item) => item.id)).toEqual(["a"]);
    expect(first.nextCursor).toBe("c1");
    expect(appended).not.toBe(first);
  });
});
