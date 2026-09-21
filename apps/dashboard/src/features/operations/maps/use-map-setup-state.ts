"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readMapAreas, readMapPoints } from "../map-setup-api";

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

  const reload = useCallback(async () => {
    if (!enabled) return;
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
    } catch (reason: unknown) {
      if (current === generation.current && !next.signal.aborted) {
        setState((value) => ({
          ...value,
          error: reason instanceof Error ? reason : new Error("Map setup read failed."),
          loading: false,
        }));
      }
      throw reason;
    }
  }, [api, enabled, locationId]);

  useEffect(() => {
    if (!enabled) {
      controller.current?.abort();
      setState({ areas: [], error: null, loading: false, points: [] });
      return;
    }
    void reload().catch(() => undefined);
    return () => controller.current?.abort();
  }, [enabled, reload]);

  return { ...state, reload };
}
