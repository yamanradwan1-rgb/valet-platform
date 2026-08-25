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
 */
export function useCursorList<Item>(options: {
  fetchPage: CursorPageFetcher<Item> | null;
  keyOf: (item: Item) => string;
  /** Identity of the data scope (e.g. location ID); changes restart loading. */
  resetKey: string | null;
}): CursorListController<Item> {
  const { fetchPage, keyOf, resetKey } = options;
  const [snapshot, setSnapshot] = useState<CursorListSnapshot<Item>>(() =>
    emptyCursorList<Item>(),
  );
  const [error, setError] = useState<unknown>(null);

  const latestRef = useRef({ fetchPage, keyOf });
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    latestRef.current = { fetchPage, keyOf };
    snapshotRef.current = snapshot;
  }, [fetchPage, keyOf, snapshot]);

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
    sequenceRef.current += 1;
    abortRunningRequest();
    loadMoreInFlightRef.current = false;
    const sequence = sequenceRef.current;
    const controller = new AbortController();
    runningRequestRef.current = controller;
    setSnapshot(emptyCursorList<Item>());
    setError(null);
    try {
      const page = await fetchPageByIdentity({
        cursor: null,
        signal: controller.signal,
      });
      if (sequenceRef.current === sequence) {
        setSnapshot(initialPageLoaded(page, latestRef.current.keyOf));
      }
    } catch (requestError: unknown) {
      if (sequenceRef.current === sequence) {
        setSnapshot(initialLoadFailed<Item>());
        setError(requestError);
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
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    runningRequestRef.current = controller;
    setSnapshot((state) => loadMoreStarted(state));
    try {
      const page = await fetchPageByIdentity({
        cursor: intendedCursor,
        signal: controller.signal,
      });
      if (sequenceRef.current === sequence) {
        setSnapshot((state) =>
          pageAppended(state, page, latestRef.current.keyOf),
        );
      }
    } catch (requestError: unknown) {
      if (sequenceRef.current === sequence) {
        setSnapshot((state) => loadMoreFailed(state));
        setError(requestError);
      }
    } finally {
      loadMoreInFlightRef.current = false;
    }
  }, []);

  const enabled = fetchPage !== null;
  useEffect(() => {
    if (resetKey === null || !enabled) return;
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

  return { ...snapshot, error, reload, loadMore };
}
