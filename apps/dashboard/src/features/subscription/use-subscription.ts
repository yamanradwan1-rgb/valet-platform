"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LocationSubscriptionResponse } from "@valet/contracts";

import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import {
  createSubscriptionLoader,
  type SubscriptionLoader,
} from "./subscription-loader";
import { idleLatestRequestSnapshot } from "../../lib/api/latest-request-gate";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";

/**
 * React binding for the /subscription page (D4-004).
 *
 * A location change is a hard request-identity reset: the previous loader is
 * disposed (aborting its request) before a new one loads the new location,
 * so stale subscription data can never survive an A→B switch. Loading is
 * expressed purely through the loader snapshot; no separate loading flag
 * exists that could fall out of sync.
 */
export function useSubscription(): {
  readonly snapshot: LatestRequestSnapshot<LocationSubscriptionResponse>;
  readonly locationId: string;
  retry: () => void;
} {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? "";

  const [snapshot, setSnapshot] = useState<
    LatestRequestSnapshot<LocationSubscriptionResponse>
  >(idleLatestRequestSnapshot);
  // The authenticated StaffApiClient instance is stable for the lifetime of
  // the shell, so mirroring it into a ref keeps loader creation effect-free.
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  const loaderRef = useRef<SubscriptionLoader | null>(null);

  useEffect(() => {
    // Empty id is unreachable while mounted: LocationGate renders this page
    // only with a selected authorized location
    // (features/location/location-gate-render-contract.test.ts pins why).
    if (locationId.length === 0) return undefined;
    const loader = createSubscriptionLoader({
      client: clientRef.current,
      onChange: setSnapshot,
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

  return { locationId, retry, snapshot };
}
