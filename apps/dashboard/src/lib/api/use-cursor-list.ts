"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CursorPage } from "./cursor-list-reducer";
import {
  canLoadMore,
  emptyCursorList,
  initialLoadFailed,
  initialPageLoaded,
  loadMoreFailed,
  loadMoreStarted,
  pageAppended,
  type CursorListSnapshot,
} from "./cursor-list-reducer";
import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "./scoped-view";

export interface CursorPageFetcher<Item> {
  (params: {
    cursor: string | null;
    signal: AbortSignal;
  }): Promise<CursorPage<Item>>;
}

export interface CursorListController<Item>
  extends CursorListSnapshot<Item> {
  /** Last transport failure of the current lifecycle, for message mapping. */
  readonly error: unknown;
  /** Re-runs the initial request (retry after an initial failure). */
  reload: () => void;
  /**
   * Requests the next page. Safe to call repeatedly: it is a no-op unless a
   * loaded list holds a server cursor and no page request is running. A retry
   * after failure re-requests exactly the cursor that failed.
   */
  loadMore: () => void;
}

/**
 * Race-safe cursor pagination for the dashboard overview lists.
 *
 * - requests are sequenced; any response from a superseded request is dropped
 *   and its connection aborted, so route/filter transitions and retries can
 *   never let an older response overwrite newer page state
 * - Load More is single-flight: a synchronous in-flight flag plus reducer
 *   guards collapse concurrent invocations into one request
 * - the fetcher/key function are synced through effects, so callers may pass
 *   inline closures without retriggering loads (also keeps React dev
 *   double-effects from issuing duplicate requests)
 *
 * D5-001 cross-location visibility: every state write is stamped with the
 * data scope captured at REQUEST start (the scope effect's closure), and
 * the returned snapshot is selected during render against the CURRENT
 * scope. A location switch therefore renders B's neutral loading posture
 * synchronously — before the reset effect runs — and a late response from
 * the previous location stays hidden even if it lands inside the
 * render-to-effect window.
 */
interface CursorStateFields<Item> {
  readonly snapshot: CursorListSnapshot<Item>;
  readonly error: unknown;
}

export function useCursorList<Item>(options: {
  fetchPage: CursorPageFetcher<Item> | null;
  keyOf: (item: Item) => string;
  /** Identity of the data scope (e.g. location ID); changes restart loading. */
  resetKey: string | null;
}): CursorListController<Item> {
  const { fetchPage, keyOf, resetKey } = options;
  const [state, setState] = useState<ScopedValue<CursorStateFields<Item>>>(
    () =>
      stampScope(null, {
        snapshot: emptyCursorList<Item>(),
        error: null,
      }),
  );

  const latestRef = useRef({ fetchPage, keyOf });
  const snapshotRef = useRef(state.value.snapshot);
  useEffect(() => {
    latestRef.current = { fetchPage, keyOf };
    snapshotRef.current = state.value.snapshot;
  }, [fetchPage, keyOf, state]);

  /**
   * Request-time data scope. Updated ONLY inside the scope effect (never
   * during render), so a response from the previous location that lands in
   * the window between the B render and A's cleanup is still stamped A and
   * stays invisible under B.
   */
  const scopeRef = useRef<string | null>(null);

  const sequenceRef = useRef(0);
  const runningRequestRef = useRef<AbortController | null>(null);
  const loadMoreInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      sequenceRef.current += 1;
      runningRequestRef.current?.abort();
      runningRequestRef.current = null;
    };
  }, []);

  const abortRunningRequest = (): void => {
    runningRequestRef.current?.abort();
    runningRequestRef.current = null;
  };

  const runInitial = useCallback(async () => {
    const fetchPageByIdentity = latestRef.current.fetchPage;
    if (fetchPageByIdentity === null) return;
    // Stamped at request start: every publish below belongs to THIS scope,
    // even if it lands after the current selection moved on.
    const scopeAtStart = scopeRef.current;
    sequenceRef.current += 1;
    abortRunningRequest();
    loadMoreInFlightRef.current = false;
    const sequence = sequenceRef.current;
    const controller = new AbortController();
    runningRequestRef.current = controller;
    setState(
      stampScope(scopeAtStart, {
        snapshot: emptyCursorList<Item>(),
        error: null,
      }),
    );
    try {
      const page = await fetchPageByIdentity({
        cursor: null,
        signal: controller.signal,
      });
      if (sequenceRef.current === sequence) {
        setState(
          stampScope(scopeAtStart, {
            snapshot: initialPageLoaded(page, latestRef.current.keyOf),
            error: null,
          }),
        );
      }
    } catch (requestError: unknown) {
      if (sequenceRef.current === sequence) {
        setState(
          stampScope(scopeAtStart, {
            snapshot: initialLoadFailed<Item>(),
            error: requestError,
          }),
        );
      }
    }
  }, []);

  const runLoadMore = useCallback(async () => {
    const current = snapshotRef.current;
    const fetchPageByIdentity = latestRef.current.fetchPage;
    const nextCursor = current.nextCursor;
    if (
      fetchPageByIdentity === null ||
      loadMoreInFlightRef.current ||
      !canLoadMore(current) ||
      nextCursor === null
    ) {
      return;
    }
    // The exact server cursor this request intends to consume; a retry after
    // failure naturally reuses it because failures never advance state.
    const intendedCursor: string = nextCursor;
    loadMoreInFlightRef.current = true;
    const scopeAtStart = scopeRef.current;
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    runningRequestRef.current = controller;
    setState((prev) =>
      stampScope(scopeAtStart, {
        snapshot: loadMoreStarted(prev.value.snapshot),
        error: prev.value.error,
      }),
    );
    try {
      const page = await fetchPageByIdentity({
        cursor: intendedCursor,
        signal: controller.signal,
      });
      if (sequenceRef.current === sequence) {
        setState((prev) =>
          stampScope(
            scopeAtStart,
            {
              snapshot: pageAppended(
                prev.value.snapshot,
                page,
                latestRef.current.keyOf,
              ),
              error: prev.value.error,
            },
          ),
        );
      }
    } catch (requestError: unknown) {
      if (sequenceRef.current === sequence) {
        setState((prev) =>
          stampScope(scopeAtStart, {
            snapshot: loadMoreFailed(prev.value.snapshot),
            error: requestError,
          }),
        );
      }
    } finally {
      loadMoreInFlightRef.current = false;
    }
  }, []);

  const enabled = fetchPage !== null;
  useEffect(() => {
    if (resetKey === null || !enabled) return;
    scopeRef.current = resetKey;
    void runInitial();
    return () => {
      sequenceRef.current += 1;
      abortRunningRequest();
    };
  }, [resetKey, enabled, runInitial]);

  const reload = useCallback(() => {
    void runInitial();
  }, [runInitial]);

  const loadMore = useCallback(() => {
    void runLoadMore();
  }, [runLoadMore]);

  // Render-time scope selection: a snapshot stamped for a previous location
  // (or an unscoped initial value) collapses to B's neutral loading posture
  // SYNCHRONOUSLY, before any effect can reset the underlying state.
  const visible = selectScopedValue<CursorStateFields<Item>>(
    state,
    resetKey ?? null,
    emptyStateFields<Item>(),
  );
  return { ...visible.snapshot, error: visible.error, reload, loadMore };
}

function emptyStateFields<Item>(): CursorStateFields<Item> {
  return { snapshot: emptyCursorList<Item>(), error: null };
}
