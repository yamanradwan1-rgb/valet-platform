"use client";

import { useCallback } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readMapParkingZones } from "../map-setup-api";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsRead } from "../use-operations-read";

export function useMapParkingZones(
  api: DashboardApiClient,
  locationId: string,
  enabled: boolean,
  scopeKey: string,
) {
  const page = useCursorPage();
  const load = useCallback(
    (signal: AbortSignal) =>
      readMapParkingZones(api, locationId, page.cursor, signal),
    [api, locationId, page.cursor],
  );
  const read = useOperationsRead(
    `${scopeKey}:map-setup:parking-zones:${page.cursor ?? "first"}`,
    load,
    enabled,
  );
  return {
    canNext: Boolean(read.data?.nextCursor),
    canPrevious: page.canPrevious,
    error: read.error,
    items: read.data?.items ?? [],
    loading: read.loading,
    next: () => page.next(read.data?.nextCursor ?? null),
    previous: page.previous,
    refresh: read.refresh,
  };
}
