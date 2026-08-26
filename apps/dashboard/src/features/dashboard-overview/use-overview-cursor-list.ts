"use client";

import { useCallback, useEffect, useState } from "react";

import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
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
  // Scope-stamped mirror of the engine state (D5-001): the owner travels
  // with every engine emission (see syncOwner), so an in-flight response
  // from the previous location stays previous-scoped even when it lands in
  // the window between the B render and A's cleanup effect.
  const [scoped, setScoped] = useState<ScopedValue<CursorListState<T>>>(() =>
    stampScope(null, createIdleCursorListState<T>()),
  );
  // Created exactly once per hook lifetime; the latest page fetcher is
  // synced through an effect below (inline closures stay safe).
  const [engine] = useState<CursorListEngine<T>>(() =>
    createCursorListEngine<T>({
      fetchPage: () =>
        Promise.reject(new Error("Cursor list fetcher is not configured.")),
      onState: (next, owner) => setScoped(stampScope(owner, next)),
    }),
  );

  // Declaration order matters: the newest fetcher is installed before any
  // scope effect can trigger a load.
  useEffect(() => {
    engine.setFetcher(fetchPage);
  }, [engine, fetchPage]);

  // Scope activation/change/unmount: declare the new owner FIRST so every
  // emission from the reset/load below is stamped for THIS location, then
  // invalidate superseded attempts and request page 1.
  useEffect(() => {
    if (!enabled || resetKey === null) return undefined;
    engine.syncOwner(resetKey ?? null);
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

  // Render-time scope selection: a previous-location snapshot collapses to
  // the idle/loading posture SYNCHRONOUSLY, before effects reset the state.
  const visible = selectScopedValue(
    scoped,
    resetKey ?? null,
    createIdleCursorListState<T>(),
  );
  return { ...visible, load, loadMore };
}
