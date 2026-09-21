"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readMapAreas, readMapPoints } from "../map-setup-api";

export type MapSetupReloadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: Error };

function asError(reason: unknown) {
  return reason instanceof Error ? reason : new Error("Map setup read failed.");
}

export function useMapSetupState(
  api: DashboardApiClient,
  locationId: string,
  enabled: boolean,
) {
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    readonly areas: readonly LocationMapArea[];
    readonly error: Error | null;
    readonly loading: boolean;
    readonly points: readonly LocationMapPoint[];
  }>({ areas: [], error: null, loading: enabled, points: [] });

  const reload = useCallback(async (): Promise<MapSetupReloadResult> => {
    if (!enabled) return { ok: false, error: new Error("Map setup is unavailable.") };
    generation.current += 1;
    const current = generation.current;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState((value) => ({ ...value, error: null, loading: true }));
    try {
      const [points, areas] = await Promise.all([
        readMapPoints(api, locationId, next.signal),
        readMapAreas(api, locationId, next.signal),
      ]);
      if (current === generation.current && !next.signal.aborted) {
        setState({ areas, error: null, loading: false, points });
      }
      return { ok: true };
    } catch (reason: unknown) {
      const error = asError(reason);
      if (current === generation.current && !next.signal.aborted) {
        setState((value) => ({
          ...value,
          error,
          loading: false,
        }));
      }
      return { ok: false, error };
    }
  }, [api, enabled, locationId]);

  useEffect(() => {
    if (!enabled) {
      controller.current?.abort();
      return;
    }
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [enabled, reload]);

  return { ...state, reload };
}
