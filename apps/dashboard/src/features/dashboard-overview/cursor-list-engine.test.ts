import { describe, expect, it } from "vitest";

import { createCursorListEngine } from "./cursor-list-engine";
import type { CursorListState } from "./cursor-list-state";
import type { OverviewListPage } from "./cursor-list-state";

interface Row {
  readonly id: string;
}

interface PendingRequest {
  readonly cursor: string | null;
  readonly signal: AbortSignal;
  resolve: (page: OverviewListPage<Row>) => void;
  reject: (error: unknown) => void;
}

function createHarness() {
  const requests: PendingRequest[] = [];
  const states: CursorListState<Row>[] = [];
  const engine = createCursorListEngine<Row>({
    fetchPage: (cursor, signal) =>
      new Promise<OverviewListPage<Row>>((resolve, reject) => {
        requests.push({ cursor, resolve, reject, signal });
      }),
    onState: (state) => states.push(state),
  });
  return { engine, requests, states };
}

function page(items: string[], nextCursor: string | null): OverviewListPage<Row> {
  return { items: items.map((id) => ({ id })), nextCursor };
}

function serverError(): Error {
  return Object.assign(new Error("boom"), { code: "INTERNAL" });
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("cursor list engine", () => {
  it("loads the first page through loading into ready", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    expect(engine.getState()).toMatchObject({ status: "loading", items: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.cursor).toBeNull();
    requests[0]!.resolve(page(["a"], "c2"));
    await flush();
    expect(engine.getState()).toEqual({
      status: "ready",
      items: [{ id: "a" }],
      nextCursor: "c2",
      error: null,
      paginationError: null,
    });
  });

  it("reports an initial failure without rows and retries the same window", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.reject(serverError());
    await flush();
    expect(engine.getState()).toMatchObject({
      status: "error",
      items: [],
      nextCursor: null,
    });
    engine.load();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.cursor).toBeNull();
  });

  it("appends later pages and keeps rows plus the cursor when Load More fails", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.resolve(page(["a"], "c2"));
    await flush();
    engine.loadMore();
    expect(requests[1]!.cursor).toBe("c2");
    requests[1]!.reject(serverError());
    await flush();
    expect(engine.getState()).toMatchObject({
      status: "ready",
      items: [{ id: "a" }],
      nextCursor: "c2",
      paginationError: expect.objectContaining({ code: "UNEXPECTED_ERROR" }),
    });
    // Retry re-requests exactly the failed opaque cursor.
    engine.loadMore();
    expect(requests[2]!.cursor).toBe("c2");
  });

  it("drops duplicate concurrent triggers while a request is in flight", () => {
    const { engine, requests } = createHarness();
    engine.load();
    engine.load();
    engine.loadMore();
    expect(requests).toHaveLength(1);
  });

  it("reset clears rows/cursor/errors immediately for the new location", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.reject(serverError());
    await flush();
    // A pagination failure from the old scope must not survive either.
    engine.reset();
    expect(engine.getState()).toEqual({
      status: "idle",
      items: [],
      nextCursor: null,
      error: null,
      paginationError: null,
    });
    engine.load();
    expect(requests[1]!.cursor).toBeNull();
  });

  it("aborts the superseded request when the scope switches", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    engine.reset();
    expect(requests[0]!.signal.aborted).toBe(true);
    engine.load();
    expect(requests[1]!.signal.aborted).toBe(false);
    expect(requests[1]!.cursor).toBeNull();
  });

  it("LOCATION SWITCH RACE: late response from location A never overwrites B", async () => {
    const { engine, requests, states } = createHarness();

    // 1. Location A request starts.
    engine.load();
    const requestA = requests[0]!;

    // 2. User switches to location B.
    engine.reset();

    // 3. Location B request starts (page 1).
    engine.load();
    const requestB = requests[1]!;
    expect(requestB.cursor).toBeNull();

    // 4. Location A response arrives LATE — even with plenty of rows and a
    //    fresh-looking cursor it must not touch state.
    requestA.resolve(page(["a1", "a2"], "cursor-A"));
    await flush();

    expect(engine.getState().items.map((row) => row.id)).not.toContain("a1");
    expect(states.every((state) => !JSON.stringify(state).includes("a1"))).toBe(
      true,
    );

    // 5. UI state remains Location B only.
    requestB.resolve(page(["b1"], "cursor-B"));
    await flush();
    const final = engine.getState();
    expect(final.status).toBe("ready");
    expect(final.items.map((row) => row.id)).toEqual(["b1"]);
    expect(final.nextCursor).toBe("cursor-B");

    // Even a late Load More append of A cannot land on B's list.
    engine.loadMore();
    const moreB = requests[requests.length - 1]!;
    expect(moreB.cursor).toBe("cursor-B");
    requestA.reject(new Error("very late A failure"));
    moreB.resolve(page(["b2"], null));
    await flush();
    expect(engine.getState()).toMatchObject({
      status: "ready",
      items: [{ id: "b1" }, { id: "b2" }],
      nextCursor: null,
      paginationError: null,
    });
  });

  it("a failed pagination from A does not survive the switch into B", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.resolve(page(["a1"], "cursor-A"));
    await flush();
    engine.loadMore();
    requests[1]!.reject(serverError());
    await flush();
    expect(engine.getState().paginationError).not.toBeNull();

    // Switch: everything from A is gone; B loads from page 1 cleanly.
    engine.reset();
    engine.load();
    requests[2]!.resolve(page(["b1"], "cursor-B"));
    await flush();
    expect(engine.getState()).toEqual({
      status: "ready",
      items: [{ id: "b1" }],
      nextCursor: "cursor-B",
      error: null,
      paginationError: null,
    });
  });

  it("an aborted in-flight Load More cannot append after the switch", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.resolve(page(["a1"], "cursor-A"));
    await flush();
    engine.loadMore();
    const loadMoreA = requests[1]!;

    engine.reset(); // switch to B
    engine.load();
    requests[2]!.resolve(page(["b1"], "cursor-B"));
    await flush();

    loadMoreA.resolve(page(["a2"], "cursor-A2"));
    await flush();

    const final = engine.getState();
    expect(final.items.map((row) => row.id)).toEqual(["b1"]);
    expect(final.nextCursor).toBe("cursor-B");
    expect(loadMoreA.signal.aborted).toBe(true);
  });

  it("nextCursor always belongs only to the current location's pages", async () => {
    const { engine, requests } = createHarness();
    engine.load();
    requests[0]!.resolve(page(["a1"], "cursor-A"));
    await flush();
    engine.reset();
    engine.load();
    requests[1]!.resolve(page(["b1"], "cursor-B"));
    await flush();
    expect(engine.getState().nextCursor).toBe("cursor-B");
  });
});
