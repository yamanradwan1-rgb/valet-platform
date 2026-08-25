"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createCursorListEngine,
  type CursorListEngine,
  type FetchScopedPage,
} from "./cursor-list-engine";
import {
  createIdleCursorListState,
  type CursorListState,
} from "./cursor-list-state";

interface Options<T> {
  /**
   * False while no authorized location is configured; the list stays idle
   * and never issues a request.
   */
  readonly enabled: boolean;
  readonly fetchPage: FetchScopedPage<T>;
  /**
   * D2-005 REQUIRED FIX: identity of the data scope (the selected location
   * ID). Whenever it changes, every in-flight request of the previous scope
   * is invalidated/aborted, rows/cursor/pagination errors are cleared
   * immediately and page 1 is requested for the new scope — a stale
   * response from a previous location can never append or replace
   * new-location data.
   */
  readonly resetKey?: string | null | undefined;
}

export interface OverviewCursorList<T> extends CursorListState<T> {
  load: () => void;
  loadMore: () => void;
}

/**
 * Generic cursor-pagination controller for the overview lists. A thin React
 * adapter over `createCursorListEngine` (see there for the guarantees).
 *
 * Scope lifecycle:
 * - enabled=false or resetKey=null -> idle, no requests;
 * - scope becomes active/changes   -> engine.reset() then one initial load;
 * - unmount/scope loss             -> engine.reset() aborts in-flight work.
 */
export function useOverviewCursorList<T>({
  enabled,
  fetchPage,
  resetKey,
}: Options<T>): OverviewCursorList<T> {
  const [state, setState] = useState<CursorListState<T>>(
    createIdleCursorListState<T>,
  );
  // Created exactly once per hook lifetime; the latest page fetcher is
  // synced through an effect below (inline closures stay safe).
  const [engine] = useState<CursorListEngine<T>>(() =>
    createCursorListEngine<T>({
      fetchPage: () =>
        Promise.reject(new Error("Cursor list fetcher is not configured.")),
      onState: setState,
    }),
  );

  // Declaration order matters: the newest fetcher is installed before any
  // scope effect can trigger a load.
  useEffect(() => {
    engine.setFetcher(fetchPage);
  }, [engine, fetchPage]);

  // Scope activation/change/unmount: reset first so old rows disappear and
  // superseded attempts can no longer land, then request page 1.
  useEffect(() => {
    if (!enabled || resetKey === null) return undefined;
    engine.reset();
    engine.load();
    return () => engine.reset();
  }, [engine, enabled, resetKey]);

  const load = useCallback(() => {
    engine.load();
  }, [engine]);

  const loadMore = useCallback(() => {
    engine.loadMore();
  }, [engine]);

  return { ...state, load, loadMore };
}
