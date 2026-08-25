import type { LiveOperationsItem } from "./live-operations-api";

import {
  canLoadMore,
  emptyCursorList,
  initialLoadFailed,
  initialPageLoaded,
  loadMoreFailed,
  loadMoreStarted,
  pageAppended,
  type CursorListSnapshot,
} from "../../lib/api/cursor-list-reducer";

/**
 * Framework-free Live Operations data controller.
 *
 * The subtle rules live here (not in React) so they are directly unit-testable:
 *
 * LOCATION IDENTITY / RACE SAFETY (D2-005 forward compatibility)
 * - every request is stamped with a monotonically increasing sequence number
 *   AND the locationId it belongs to;
 * - `load(locationId)` is the only way to change request identity; it aborts
 *   any in-flight request and supersedes all older sequences;
 * - a response is applied only while BOTH its sequence number and its
 *   location identity are still current, so a late Location A response can
 *   never surface as Location B data;
 * - switching locations resets rows, cursor and observedAt to empty/loading.
 *
 * SNAPSHOT SEMANTICS
 * - the backend stamps EVERY request with a fresh transaction_timestamp and
 *   the pagination cursor freezes no snapshot, so page 1 and page 2 may carry
 *   different observedAt values. The truthful model implemented here is:
 *   `observedAt` is the observation time of the MOST RECENT SUCCESSFUL
 *   server request. An accepted Load More response therefore advances it
 *   (later reads never move it backwards in practice), a failed refresh or
 *   failed page keeps the last successful value, and a location change resets
 *   it to null;
 * - explicit `refresh()` re-requests page one for the CURRENT location while
 *   keeping already-loaded rows visible; on failure the previous snapshot
 *   survives with `refreshFailed: true` — no mock or placeholder substitution;
 * - item merging/cursor stickiness are delegated to the shared, tested
 *   cursor-list-reducer (no duplicated merge logic).
 */
export interface LiveOperationsPageData {
  readonly items: readonly LiveOperationsItem[];
  readonly nextCursor: string | null;
  readonly observedAt: string;
}

export interface LiveOperationsSnapshot
  extends CursorListSnapshot<LiveOperationsItem> {
  /**
   * Observation time of the most recent successful server request (the
   * backend stamps each request freshly; pagination freezes no snapshot).
   */
  readonly observedAt: string | null;
  /** True while an explicit refresh re-requests the current snapshot. */
  readonly refreshing: boolean;
  /** True when the last explicit refresh failed but prior data survived. */
  readonly refreshFailed: boolean;
  /** Last transport/contract failure of the current lifecycle. */
  readonly error: unknown;
}

export interface LiveOperationsFetcherParams {
  readonly locationId: string;
  readonly cursor: string | null;
  readonly signal: AbortSignal;
}

export type LiveOperationsFetcher = (
  params: LiveOperationsFetcherParams,
) => Promise<LiveOperationsPageData>;

export interface LiveOperationsController {
  /** Loads the first page for a location; supersedes everything prior. */
  load(locationId: string): void;
  /** Re-runs page one for the current location, keeping visible rows. */
  refresh(): void;
  /** Retries after a failed initial load for the current location. */
  retry(): void;
  loadMore(): void;
  dispose(): void;
}

function keyOf(item: LiveOperationsItem): string {
  return item.trackingSessionId;
}

function idleSnapshot(): LiveOperationsSnapshot {
  return {
    ...emptyCursorList<LiveOperationsItem>(),
    observedAt: null,
    refreshing: false,
    refreshFailed: false,
    error: null,
  };
}

export function createLiveOperationsController(options: {
  fetcher: LiveOperationsFetcher;
  onChange: (snapshot: LiveOperationsSnapshot) => void;
}): LiveOperationsController {
  let snapshot: LiveOperationsSnapshot = idleSnapshot();
  // Request identity inputs: sequence + owning location must BOTH be current
  // for a response to become visible state.
  let sequence = 0;
  let activeLocationId: string | null = null;
  let inflight: AbortController | null = null;
  let disposed = false;

  const commit = (next: LiveOperationsSnapshot): void => {
    snapshot = next;
    options.onChange(snapshot);
  };

  const isCurrent = (seq: number, locationId: string): boolean =>
    !disposed && seq === sequence && locationId === activeLocationId;

  const abortInflight = (): void => {
    if (inflight !== null) {
      inflight.abort();
      inflight = null;
    }
  };

  async function runInitial(
    locationId: string,
    mode: "load" | "refresh",
  ): Promise<void> {
    const seq = ++sequence;
    abortInflight();
    activeLocationId = locationId;
    const controller = new AbortController();
    inflight = controller;
    if (mode === "load") {
      // New request identity: old-location rows must not survive.
      commit(idleSnapshot());
    } else {
      commit({ ...snapshot, refreshing: true, refreshFailed: false });
    }
    try {
      const page = await options.fetcher({
        cursor: null,
        locationId,
        signal: controller.signal,
      });
      if (!isCurrent(seq, locationId)) return;
      commit({
        ...initialPageLoaded(page, keyOf),
        observedAt: page.observedAt,
        refreshing: false,
        refreshFailed: false,
        error: null,
      });
    } catch (error) {
      if (!isCurrent(seq, locationId)) return;
      if (controller.signal.aborted) return;
      if (mode === "refresh") {
        commit({
          ...snapshot,
          refreshing: false,
          refreshFailed: true,
          error,
        });
      } else {
        commit({
          ...initialLoadFailed<LiveOperationsItem>(),
          observedAt: null,
          refreshing: false,
          refreshFailed: false,
          error,
        });
      }
    } finally {
      // Release the single-flight slot so Load More can run afterwards.
      if (inflight === controller) inflight = null;
    }
  }

  async function runLoadMore(): Promise<void> {
    // Single-flight across ALL request kinds: no page request may start while
    // an initial load or refresh is running, and vice versa.
    const before = snapshot;
    if (
      inflight !== null ||
      disposed ||
      activeLocationId === null ||
      before.nextCursor === null ||
      !canLoadMore(before)
    ) {
      return;
    }
    const locationId = activeLocationId;
    const intendedCursor: string = before.nextCursor;
    const started = loadMoreStarted(before);
    if (started === before) return;
    const seq = ++sequence;
    const controller = new AbortController();
    inflight = controller;
    commit({
      ...started,
      observedAt: before.observedAt,
      refreshing: false,
      refreshFailed: before.refreshFailed,
      error: before.error,
    });
    try {
      const page = await options.fetcher({
        cursor: intendedCursor,
        locationId,
        signal: controller.signal,
      });
      if (!isCurrent(seq, locationId)) return;
      commit({
        // Failures never advance the cursor; exhaustion stays sticky.
        ...pageAppended(before, page, keyOf),
        // Each accepted response carries its own fresh backend observation
        // time; the header reports the most recent successful server read.
        observedAt: page.observedAt,
        refreshing: false,
        refreshFailed: false,
        error: null,
      });
    } catch (error) {
      if (!isCurrent(seq, locationId)) return;
      if (controller.signal.aborted) return;
      commit({
        ...loadMoreFailed(before),
        observedAt: before.observedAt,
        refreshing: false,
        refreshFailed: before.refreshFailed,
        error,
      });
    } finally {
      if (inflight === controller) inflight = null;
    }
  }

  return {
    load(locationId: string): void {
      void runInitial(locationId, "load");
    },
    refresh(): void {
      if (activeLocationId !== null && !disposed) {
        void runInitial(activeLocationId, "refresh");
      }
    },
    retry(): void {
      if (activeLocationId !== null && !disposed) {
        void runInitial(activeLocationId, "load");
      }
    },
    loadMore(): void {
      void runLoadMore();
    },
    dispose(): void {
      disposed = true;
      sequence += 1;
      abortInflight();
    },
  };
}
