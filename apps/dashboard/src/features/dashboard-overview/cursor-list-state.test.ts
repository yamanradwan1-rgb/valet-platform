import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";

import {
  createIdleCursorListState,
  cursorListLoadFailed,
  cursorListLoadMoreFailed,
  cursorListLoadMoreStarted,
  cursorListLoadMoreSucceeded,
  cursorListLoadStarted,
  cursorListLoadSucceeded,
} from "./cursor-list-state";

interface Row {
  readonly id: string;
}

function failure(): DashboardApiError {
  return new DashboardApiError({
    kind: "server",
    status: 500,
    code: "INTERNAL_ERROR",
    message: "failed",
  });
}

describe("cursor list state machine", () => {
  it("starts idle, empty and exhausted", () => {
    const state = createIdleCursorListState<Row>();
    expect(state).toEqual({
      status: "idle",
      items: [],
      nextCursor: null,
      error: null,
      paginationError: null,
    });
  });

  it("replaces the visible rows with the first page on initial success", () => {
    const started = cursorListLoadStarted(createIdleCursorListState<Row>());
    const done = cursorListLoadSucceeded(started, {
      items: [{ id: "a" }],
      nextCursor: "c1",
    });
    expect(done.status).toBe("ready");
    expect(done.items.map((row) => row.id)).toEqual(["a"]);
    expect(done.nextCursor).toBe("c1");
    expect(done.error).toBeNull();
  });

  it("treats an empty first page with a null cursor as the end of pagination", () => {
    const started = cursorListLoadStarted(createIdleCursorListState<Row>());
    const done = cursorListLoadSucceeded(started, {
      items: [],
      nextCursor: null,
    });
    expect(done.status).toBe("ready");
    expect(done.items).toEqual([]);
    expect(done.nextCursor).toBeNull();
  });

  it("reports an initial-load failure without rows", () => {
    const done = cursorListLoadFailed(
      createIdleCursorListState<Row>(),
      failure(),
    );
    expect(done.status).toBe("error");
    expect(done.items).toEqual([]);
    expect(done.error?.code).toBe("INTERNAL_ERROR");
  });

  it("appends later pages while preserving order", () => {
    const started = cursorListLoadStarted(createIdleCursorListState<Row>());
    const first = cursorListLoadSucceeded(started, {
      items: [{ id: "a" }, { id: "b" }],
      nextCursor: "c2",
    });
    const more = cursorListLoadMoreStarted(first);
    expect(more.status).toBe("loadingMore");
    const second = cursorListLoadMoreSucceeded(more, {
      items: [{ id: "c" }],
      nextCursor: null,
    });
    expect(second.items.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(second.nextCursor).toBeNull();
  });

  it("preserves loaded rows AND the pending cursor when Load More fails", () => {
    const started = cursorListLoadStarted(createIdleCursorListState<Row>());
    const first = cursorListLoadSucceeded(started, {
      items: [{ id: "a" }],
      nextCursor: "c2",
    });
    const failed = cursorListLoadMoreFailed(first, failure());
    expect(failed.status).toBe("ready");
    expect(failed.items.map((row) => row.id)).toEqual(["a"]);
    expect(failed.nextCursor).toBe("c2");
    expect(failed.paginationError?.code).toBe("INTERNAL_ERROR");
  });

  it("does not duplicate rows when the same window is retried after a pagination failure", () => {
    // page 1 succeeds, page 2 fails once, retry of page 2 succeeds.
    let state = cursorListLoadStarted(createIdleCursorListState<Row>());
    state = cursorListLoadSucceeded(state, {
      items: [{ id: "a" }, { id: "b" }],
      nextCursor: "window-2",
    });
    state = cursorListLoadMoreStarted(state);
    state = cursorListLoadMoreFailed(state, failure());
    // Retry re-requests the exact same opaque cursor window.
    state = cursorListLoadMoreStarted(state);
    state = cursorListLoadMoreSucceeded(state, {
      items: [{ id: "c" }],
      nextCursor: null,
    });
    expect(state.items.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(state.paginationError).toBeNull();
  });

  it("clears a previous pagination error when the retry starts", () => {
    const started = cursorListLoadStarted(createIdleCursorListState<Row>());
    const first = cursorListLoadSucceeded(started, {
      items: [{ id: "a" }],
      nextCursor: "c2",
    });
    const failed = cursorListLoadMoreFailed(first, failure());
    const retrying = cursorListLoadMoreStarted(failed);
    expect(retrying.paginationError).toBeNull();
    expect(retrying.nextCursor).toBe("c2");
  });
});
