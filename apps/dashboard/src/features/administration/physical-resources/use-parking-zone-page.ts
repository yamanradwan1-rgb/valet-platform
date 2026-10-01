"use client";

import { useCallback, useState } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { readParkingZones } from "./physical-resources-api";

export function useParkingZonePage(
  api: DashboardApiClient,
  locationId: string,
  scopeKey: string,
  enabled: boolean,
) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      // Development StrictMode disposes its first effect before this dispatch.
      await Promise.resolve();
      signal.throwIfAborted();
      return readParkingZones(api, locationId, signal, cursor);
    },
    [api, locationId, cursor],
  );
  const read = useAuthoritativeRead(
    `${scopeKey}:zones:${cursor ?? "first"}`,
    load,
    enabled,
  );
  return {
    ...read,
    hasPrevious: history.length > 0,
    next() {
      if (read.loading || !read.data?.nextCursor) return;
      setHistory((items) => [...items, cursor]);
      setCursor(read.data.nextCursor);
    },
    previous() {
      if (read.loading || history.length === 0) return;
      const nextHistory = [...history];
      setCursor(nextHistory.pop() ?? null);
      setHistory(nextHistory);
    },
  };
}
