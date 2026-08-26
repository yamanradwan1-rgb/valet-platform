import { DashboardApiError } from "../../lib/api/api-error";

import {
  createIdleCursorListState,
  cursorListLoadFailed,
  cursorListLoadMoreFailed,
  cursorListLoadMoreStarted,
  cursorListLoadMoreSucceeded,
  cursorListLoadStarted,
  cursorListLoadSucceeded,
  type CursorListState,
  type OverviewListPage,
} from "./cursor-list-state";

export type FetchScopedPage<T> = (
  cursor: string | null,
  signal: AbortSignal,
) => Promise<OverviewListPage<T>>;

interface EngineOptions<T> {
  readonly fetchPage: FetchScopedPage<T>;
  /**
   * Receives every applied state transition together with the data scope
   * currently owning the engine (see syncOwner), so adapters can stamp
   * snapshots for render-time scope selection without touching refs.
   */
  readonly onState: (state: CursorListState<T>, owner: string | null) => void;
}

export interface CursorListEngine<T> {
  getState(): CursorListState<T>;
  /**
   * Declares the data scope that subsequent load()/loadMore() attempts
   * belong to (the selected location). Purely informational: it never
   * resets or emits by itself — call reset()/load() as before.
   */
  syncOwner(owner: string | null): void;
  /**
   * Replaces the page fetcher (the React hook syncs its latest closure here
   * from an effect). Never resets state: scope switches go through reset().
   */
  setFetcher(fetchPage: FetchScopedPage<T>): void;
  /** Initial page request (also the retry path for a failed first page). */
  load(): void;
  /** Next cursor window; single-flight and only from a ready list. */
  loadMore(): void;
  /**
   * Location/scope switch: invalidates every in-flight attempt, aborts the
   * running request and clears rows, cursors and pagination errors
   * IMMEDIATELY, so nothing from a previous scope survives into the new one.
   * The following load() starts from page 1 (null cursor).
   */
  reset(): void;
}

function normalizeFailure(error: unknown): DashboardApiError {
  if (error instanceof DashboardApiError) return error;
  return new DashboardApiError({
    kind: "server",
    status: 0,
    code: "UNEXPECTED_ERROR",
    message: "The operation could not be completed.",
  });
}

/**
 * Framework-free orchestration for ONE location-scoped cursor list
 * (D2-005 location-switch safety for the D2-004 surfaces).
 *
 * Guarantees:
 * - exactly one request in flight; duplicate triggers are dropped;
 * - every response carries its attempt number: a response from a superseded
 *   attempt (previous location, previous retry, aborted switch) can NEVER
 *   append to or replace newer state — including its errors;
 * - a failed Load More preserves loaded rows AND the exact pending cursor,
 *   so a retry re-requests the same window without duplicating rows;
 * - `nextCursor === null` ends pagination entirely.
 *
 * Kept free of React so the race rules are directly unit-testable; the hook
 * in `use-overview-cursor-list.ts` is a thin adapter around this engine.
 */
export function createCursorListEngine<T>(
  options: EngineOptions<T>,
): CursorListEngine<T> {
  let state: CursorListState<T> = createIdleCursorListState<T>();
  let owner: string | null = null;
  let fetchPage = options.fetchPage;
  let attempt = 0;
  let inFlight = false;
  let controller: AbortController | null = null;

  const apply = (next: CursorListState<T>): void => {
    state = next;
    options.onState(next, owner);
  };

  const setFetcher = (next: FetchScopedPage<T>): void => {
    fetchPage = next;
  };

  const syncOwner = (next: string | null): void => {
    owner = next;
  };

  /**
   * Settles one finished request. A stale/aborted outcome never touches
   * list state; single-flight is released for whichever case still owns
   * the newest attempt (a superseding reset() already released it).
   */
  const settle = (
    mine: number,
    ownController: AbortController,
  ): { live: boolean } => {
    const stale = mine !== attempt || ownController.signal.aborted;
    if (!stale) {
      inFlight = false;
      controller = null;
      return { live: true };
    }
    if (mine === attempt) {
      inFlight = false;
      controller = null;
    }
    return { live: false };
  };

  const load = (): void => {
    if (inFlight) return;
    inFlight = true;
    const mine = ++attempt;
    const ownController = new AbortController();
    controller = ownController;
    apply(cursorListLoadStarted(state));
    fetchPage(null, ownController.signal).then(
      (page) => {
        if (!settle(mine, ownController).live) return;
        apply(cursorListLoadSucceeded(state, page));
      },
      (error: unknown) => {
        if (!settle(mine, ownController).live) return;
        apply(cursorListLoadFailed(state, normalizeFailure(error)));
      },
    );
  };

  const loadMore = (): void => {
    if (inFlight || state.status !== "ready" || state.nextCursor === null) {
      return;
    }
    inFlight = true;
    const mine = ++attempt;
    const ownController = new AbortController();
    controller = ownController;
    const pendingCursor = state.nextCursor;
    apply(cursorListLoadMoreStarted(state));
    fetchPage(pendingCursor, ownController.signal).then(
      (page) => {
        if (!settle(mine, ownController).live) return;
        apply(cursorListLoadMoreSucceeded(state, page));
      },
      (error: unknown) => {
        if (!settle(mine, ownController).live) return;
        apply(cursorListLoadMoreFailed(state, normalizeFailure(error)));
      },
    );
  };

  const reset = (): void => {
    attempt += 1;
    inFlight = false;
    controller?.abort();
    controller = null;
    apply(createIdleCursorListState<T>());
  };

  return {
    getState: () => state,
    syncOwner,
    setFetcher,
    load,
    loadMore,
    reset,
  };
}
