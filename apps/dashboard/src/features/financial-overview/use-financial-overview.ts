"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  idleLatestRequestSnapshot,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";
import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

import { createFinancialOverviewLoader } from "./financial-overview-loader";
import type { FinancialOverviewLoader } from "./financial-overview-loader";
import type { FinancialOverviewResponse } from "@valet/contracts";

/**
 * React binding for the Financial Overview loader.
 *
 * A location change is a hard request-identity reset: the previous loader is
 * disposed (aborting its request) before a new one loads the new location,
 * so stale financial data can never survive an A→B switch. Loading is
 * expressed purely through the loader snapshot; no separate loading flag
 * exists that could fall out of sync.
 */
export function useFinancialOverview(
  client: StaffApiClient,
  locationId: string | null,
): {
  readonly snapshot: LatestRequestSnapshot<FinancialOverviewResponse>;
  retry: () => void;
} {
  const [scoped, setScoped] = useState<
    ScopedValue<LatestRequestSnapshot<FinancialOverviewResponse>>
  >(() => stampScope(null, idleLatestRequestSnapshot()));
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  const loaderRef = useRef<FinancialOverviewLoader | null>(null);

  useEffect(() => {
    if (locationId === null || locationId.length === 0) return undefined;
    // Stamped from THIS effect's closure (request-time scope): a late
    // response from the previous location stays previous-scoped even inside
    // the render-to-effect window before this cleanup runs.
    const scope = locationId;
    const loader = createFinancialOverviewLoader({
      client: clientRef.current,
      onChange: (snapshot) => setScoped(stampScope(scope, snapshot)),
    });
    loaderRef.current = loader;
    loader.load(locationId);
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [locationId]);

  const retry = useCallback(() => {
    loaderRef.current?.retry();
  }, []);

  // Render-time scope selection (D5-001): a previous-location snapshot
  // collapses to B's idle posture synchronously, before effects run.
  const snapshot = selectScopedValue(
    scoped,
    locationId === null ? null : locationId,
    idleLatestRequestSnapshot(),
  );

  return { snapshot, retry };
}
