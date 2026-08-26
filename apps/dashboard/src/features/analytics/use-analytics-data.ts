"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  idleLatestRequestSnapshot,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

import { createAnalyticsLoader } from "./analytics-loader";
import type { AnalyticsLoader } from "./analytics-loader";
import type { AnalyticsComposition } from "./analytics-api";

export interface AnalyticsSelection {
  readonly locationId: string;
  readonly from: string;
  readonly to: string;
}

/**
 * React binding for the Analytics loader.
 *
 * Any input change (location or applied period) is a hard request-identity
 * reset: the previous loader is disposed (aborting its in-flight requests)
 * before a new one loads the new identity. A `null` selection (no location
 * yet) stays idle and never fires requests; period validity is gated by the
 * page before a selection is passed down — and the backend remains the
 * authority on period semantics regardless.
 */
export function useAnalyticsData(
  client: StaffApiClient,
  selection: AnalyticsSelection | null,
): {
  readonly snapshot: LatestRequestSnapshot<AnalyticsComposition>;
  retry: () => void;
} {
  const [snapshot, setSnapshot] = useState<
    LatestRequestSnapshot<AnalyticsComposition>
  >(idleLatestRequestSnapshot);
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  const loaderRef = useRef<AnalyticsLoader | null>(null);

  // Primitive identity inputs keep the effect honest without object churn.
  const locationId = selection?.locationId ?? null;
  const from = selection?.from ?? null;
  const to = selection?.to ?? null;

  useEffect(() => {
    if (
      locationId === null ||
      from === null ||
      to === null ||
      locationId.length === 0
    ) {
      return undefined;
    }
    const loader = createAnalyticsLoader({
      client: clientRef.current,
      onChange: setSnapshot,
    });
    loaderRef.current = loader;
    loader.load({ from, locationId, to });
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [locationId, from, to]);

  const retry = useCallback(() => {
    loaderRef.current?.retry();
  }, []);

  return { snapshot, retry };
}
