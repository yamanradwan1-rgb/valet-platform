"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardApiError } from "../../lib/api/api-error";

import {
  loadOverviewComposition,
  type OverviewClient,
  type OverviewComposition,
} from "./overview-api";

/**
 * Load lifecycle for the composed Overview surface.
 *
 * - loading:   first load or an explicit reload; nothing stale is rendered
 * - ready:     all three backend requests succeeded
 * - error:     any request failed (single coherent failure model); the raw
 *              DashboardApiError is preserved so the page can choose a
 *              friendly message and whether retry makes sense
 */
export type OverviewLoadState =
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly data: OverviewComposition }
  | { readonly phase: "error"; readonly error: DashboardApiError };

export interface UseOverviewDataResult {
  readonly state: OverviewLoadState;
  reload: () => void;
}

/** A finished attempt keeps its exact ready/error payload for its identity. */
type SettledOutcome = Exclude<OverviewLoadState, { phase: "loading" }>;

interface SettledResult {
  readonly attempt: number;
  readonly locationId: string;
  readonly outcome: SettledOutcome;
}

/**
 * Derives what the UI may render. Any identity mismatch (a newer attempt or a
 * different location) collapses to `loading`, so a slow Location A response
 * can never replace Location B data even if an abort were lost. Mirrors
 * selectSetupLoadState in features/map-setup/map-setup-state.ts.
 */
export function selectOverviewLoadState(
  settled: SettledResult | null,
  requestLocationId: string,
  attempt: number,
): OverviewLoadState {
  if (
    settled === null ||
    settled.attempt !== attempt ||
    settled.locationId !== requestLocationId
  ) {
    return { phase: "loading" };
  }
  return settled.outcome;
}

function toDashboardApiError(error: unknown): DashboardApiError {
  if (error instanceof DashboardApiError) return error;
  return new DashboardApiError({
    code: "OVERVIEW_UNEXPECTED_ERROR",
    kind: "server",
    message: "The overview failed for an unexpected reason.",
    status: 0,
  });
}

const ABORT_ERROR_NAME = "AbortError";

/**
 * Runs the Overview composition against the shared authenticated transport.
 *
 * Session-expiry handling stays inside the D2-001 foundation: StaffApiClient
 * transparently retries once after a single-flight refresh; if the session is
 * truly over, the auth provider flips status -> the dashboard layout redirects
 * to /session-expired. This hook simply surfaces the final error.
 *
 * Loading is DERIVED from the request identity (attempt + location, see
 * selectOverviewLoadState) instead of being written synchronously inside
 * the effect, so a reload or location switch never renders stale data and
 * effects stay free of cascading setState calls.
 */
export function useOverviewData(
  client: OverviewClient,
  locationId: string,
): UseOverviewDataResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledResult | null>(null);

  const reload = useCallback(() => {
    setAttempt((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (locationId.length === 0) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    void loadOverviewComposition(client, locationId, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setSettled({
            attempt,
            locationId,
            outcome: { data, phase: "ready" },
          });
        }
      })
      .catch((error: unknown) => {
        // Aborts happen only on unmount/reload teardown; never show them.
        if (cancelled) return;
        if (error instanceof Error && error.name === ABORT_ERROR_NAME) return;
        setSettled({
          attempt,
          locationId,
          outcome: { error: toDashboardApiError(error), phase: "error" },
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, client, locationId]);

  // Render-time identity collapse: a settled payload from another location
  // or a superseded attempt renders as loading, never as current truth.
  const state = selectOverviewLoadState(settled, locationId, attempt);

  return { reload, state };
}
