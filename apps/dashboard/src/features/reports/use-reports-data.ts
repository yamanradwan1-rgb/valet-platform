"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  idleLatestRequestSnapshot,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

import { createReportsLoader } from "./reports-loader";
import type { ReportsLoader } from "./reports-loader";
import type { ReportResponse } from "./reports-api";

export interface ReportSelection {
  readonly kind: ReportResponse["kind"];
  readonly locationId: string;
  readonly periodValue: string;
}

/**
 * React binding for the Reports loader.
 *
 * Any input change (location, kind or applied period) is a hard
 * request-identity reset: the previous loader is disposed (aborting its
 * in-flight request) before a new one loads the new identity. A `null`
 * selection stays idle and never fires requests; period validity is gated
 * by the page before a selection is passed down — and the backend remains
 * the authority on period semantics regardless.
 */
export function useReportsData(
  client: StaffApiClient,
  selection: ReportSelection | null,
): {
  readonly snapshot: LatestRequestSnapshot<ReportResponse>;
  retry: () => void;
} {
  const [snapshot, setSnapshot] = useState<
    LatestRequestSnapshot<ReportResponse>
  >(idleLatestRequestSnapshot);
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  const loaderRef = useRef<ReportsLoader | null>(null);

  // Primitive identity inputs keep the effect honest without object churn.
  const locationId = selection?.locationId ?? null;
  const kind = selection?.kind ?? null;
  const periodValue = selection?.periodValue ?? null;

  useEffect(() => {
    if (
      locationId === null ||
      kind === null ||
      periodValue === null ||
      locationId.length === 0
    ) {
      return undefined;
    }
    const loader = createReportsLoader({
      client: clientRef.current,
      onChange: setSnapshot,
    });
    loaderRef.current = loader;
    loader.load({ kind, locationId, periodValue });
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [locationId, kind, periodValue]);

  const retry = useCallback(() => {
    loaderRef.current?.retry();
  }, []);

  return { retry, snapshot };
}
