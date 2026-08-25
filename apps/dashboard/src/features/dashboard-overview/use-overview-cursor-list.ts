"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

interface Options<T> {
  /**
   * False while no authorized location is configured; the list stays idle
   * and never issues a request.
   */
  readonly enabled: boolean;
  readonly fetchPage: (cursor: string | null) => Promise<OverviewListPage<T>>;
}

export interface OverviewCursorList<T> extends CursorListState<T> {
  load: () => void;
  loadMore: () => void;
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
 * Generic cursor-pagination controller for the overview lists.
 *
 * Guarantees:
 * - one request in flight at a time (duplicate concurrent Load More calls
 *   are dropped);
 * - stale responses from superseded requests are ignored by sequence;
 * - a pagination failure keeps the loaded rows and retries the SAME opaque
 *   cursor, so a retry never duplicates rows;
 * - `nextCursor === null` disables Load More entirely.
 */
export function useOverviewCursorList<T>({
  enabled,
  fetchPage,
}: Options<T>): OverviewCursorList<T> {
  const [state, setState] = useState<CursorListState<T>>(
    createIdleCursorListState<T>,
  );
  const fetchRef = useRef(fetchPage);
  const stateRef = useRef(state);
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(() => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    const sequence = ++sequenceRef.current;
    setState((current) => cursorListLoadStarted(current));
    fetchRef.current(null).then(
      (page) => {
        if (sequence !== sequenceRef.current) return;
        inFlightRef.current = false;
        setState((current) => cursorListLoadSucceeded(current, page));
      },
      (error: unknown) => {
        if (sequence !== sequenceRef.current) return;
        inFlightRef.current = false;
        setState((current) =>
          cursorListLoadFailed(current, normalizeFailure(error)),
        );
      },
    );
  }, [enabled]);

  const loadMore = useCallback(() => {
    const snapshot = stateRef.current;
    if (
      !enabled ||
      snapshot.status !== "ready" ||
      snapshot.nextCursor === null ||
      inFlightRef.current
    ) {
      return;
    }
    inFlightRef.current = true;
    const sequence = ++sequenceRef.current;
    setState((current) => cursorListLoadMoreStarted(current));
    const pendingCursor = snapshot.nextCursor;
    fetchRef.current(pendingCursor).then(
      (page) => {
        if (sequence !== sequenceRef.current) return;
        inFlightRef.current = false;
        setState((current) => cursorListLoadMoreSucceeded(current, page));
      },
      (error: unknown) => {
        if (sequence !== sequenceRef.current) return;
        inFlightRef.current = false;
        setState((current) =>
          cursorListLoadMoreFailed(current, normalizeFailure(error)),
        );
      },
    );
  }, [enabled]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { ...state, load, loadMore };
}
