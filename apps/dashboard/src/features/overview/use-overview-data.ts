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
  readonly outcome: SettledOutcome;
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
 * Loading is DERIVED from the request identity (`settled.attempt !== attempt`)
 * instead of being written synchronously inside the effect, so a reload never
 * renders stale data and effects stay free of cascading setState calls.
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
          setSettled({ attempt, outcome: { data, phase: "ready" } });
        }
      })
      .catch((error: unknown) => {
        // Aborts happen only on unmount/reload teardown; never show them.
        if (cancelled) return;
        if (error instanceof Error && error.name === ABORT_ERROR_NAME) return;
        setSettled({
          attempt,
          outcome: { error: toDashboardApiError(error), phase: "error" },
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, client, locationId]);

  const state: OverviewLoadState =
    settled !== null && settled.attempt === attempt
      ? settled.outcome
      : { phase: "loading" };

  return { reload, state };
}
