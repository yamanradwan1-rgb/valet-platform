import type { DashboardApiError } from "../../lib/api/api-error";

/**
 * Cursor-list state machine for the location-overview surfaces.
 *
 * Pure transitions only: the React hook in `use-overview-cursor-list.ts`
 * applies them, and tests drive the exact same functions. Rules enforced
 * here (per the accepted pagination contract):
 *
 * - `{ items, nextCursor }` with an opaque cursor; no page numbers exist.
 * - A failed "load more" keeps every already-loaded row and the pending
 *   cursor, so a retry continues from the same window instead of duplicating
 *   rows.
 * - `nextCursor === null` ends pagination.
 */
export interface OverviewListPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export type CursorListStatus =
  | "idle"
  | "loading"
  | "ready"
  | "loadingMore"
  | "error";

export interface CursorListState<T> {
  readonly status: CursorListStatus;
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  /** Initial-load failure. Rows are not shown while this is set. */
  readonly error: DashboardApiError | null;
  /** Load-more failure. Loaded rows stay visible while this is set. */
  readonly paginationError: DashboardApiError | null;
}

export function createIdleCursorListState<T>(): CursorListState<T> {
  return {
    status: "idle",
    items: [],
    nextCursor: null,
    error: null,
    paginationError: null,
  };
}

export function cursorListLoadStarted<T>(
  state: CursorListState<T>,
): CursorListState<T> {
  return { ...state, status: "loading", error: null };
}

/** The first page replaces whatever was shown before it. */
export function cursorListLoadSucceeded<T>(
  _state: CursorListState<T>,
  page: OverviewListPage<T>,
): CursorListState<T> {
  return {
    status: "ready",
    items: page.items,
    nextCursor: page.nextCursor,
    error: null,
    paginationError: null,
  };
}

export function cursorListLoadFailed<T>(
  _state: CursorListState<T>,
  error: DashboardApiError,
): CursorListState<T> {
  return {
    status: "error",
    items: [],
    nextCursor: null,
    error,
    paginationError: null,
  };
}

export function cursorListLoadMoreStarted<T>(
  state: CursorListState<T>,
): CursorListState<T> {
  return { ...state, status: "loadingMore", paginationError: null };
}

/** Later pages append to the loaded rows; duplicates cannot appear because
 * the pending cursor advances atomically with the append on success. */
export function cursorListLoadMoreSucceeded<T>(
  state: CursorListState<T>,
  page: OverviewListPage<T>,
): CursorListState<T> {
  return {
    status: "ready",
    items: [...state.items, ...page.items],
    nextCursor: page.nextCursor,
    error: null,
    paginationError: null,
  };
}

/**
 * Pagination failure preserves the loaded rows AND the unchanged cursor, so
 * retrying re-requests exactly the failed window.
 */
export function cursorListLoadMoreFailed<T>(
  state: CursorListState<T>,
  error: DashboardApiError,
): CursorListState<T> {
  return { ...state, status: "ready", paginationError: error };
}
