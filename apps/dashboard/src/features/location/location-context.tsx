"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchAuthorizedLocations } from "../../lib/api/location-endpoints";
import { useAuth } from "../auth/use-auth";
import {
  bootstrapSucceeded,
  isAuthorizedLocation,
  type AuthorizedDashboardLocation,
} from "./location-bootstrap-state";

/**
 * D2-005 — production dashboard location context.
 *
 * The authorized locations ALWAYS come from the authenticated backend
 * endpoint (GET /v1/staff/dashboard/locations) through the shared
 * StaffApiClient. There is no fabricated or environment-provided location
 * list anymore; selection is a UX preference only and never an
 * authorization source — every API call remains authorized server-side by
 * exact Location ID.
 *
 * State semantics (distinct):
 * - loading   bootstrap request in flight (no location is ever faked);
 *             DERIVED from "no settled outcome for the current attempt",
 *             exactly like the approved useOverviewData pattern.
 * - ready     backend answered; possibly ZERO authorized locations, which
 *             is a no-access posture handled by the shell gate
 * - error     bootstrap transport/server failure — retryable, never treated
 *             as zero locations
 */

export interface DashboardLocationMeta {
  readonly locationId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
}

export type LocationContextStatus = "loading" | "ready" | "error";

interface LocationContextValue {
  readonly status: LocationContextStatus;
  /** Empty until ready; ready with zero entries means no access. */
  readonly locations: readonly DashboardLocationMeta[];
  /** Currently selected authorized location, when one exists. */
  readonly location: DashboardLocationMeta | null;
  /** Raw bootstrap failure (kind drives session-expiry/retry decisions). */
  readonly error: unknown;
  /** Selects another AUTHORIZED location; unauthorized ids are ignored. */
  selectLocation: (locationId: string) => void;
  /** Re-runs the authorized-location bootstrap (failure retry / drift). */
  reloadLocations: () => void;
}

type BootstrapOutcome =
  | {
      readonly ok: true;
      readonly locations: readonly AuthorizedDashboardLocation[];
    }
  | { readonly ok: false; readonly error: unknown };

interface ProviderState {
  /** Null while the current attempt has not settled yet (= loading). */
  readonly outcome: BootstrapOutcome | null;
  /** In-memory selection preference; revalidated on every fresh list. */
  readonly preference: string | null;
}

const LocationContext = createContext<LocationContextValue | null>(null);

function toMetaList(
  locations: readonly AuthorizedDashboardLocation[],
): DashboardLocationMeta[] {
  return locations.map((entry) => ({
    currency: entry.currency,
    locationId: entry.locationId,
    name: entry.name,
    organizationId: entry.organizationId,
    timezone: entry.timezone,
  }));
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { client, status, session } = useAuth();
  const sessionEmail = session?.email ?? null;
  const [state, setState] = useState<ProviderState>({
    outcome: null,
    preference: null,
  });
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setState({ outcome: null, preference: null });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const locations = await fetchAuthorizedLocations(
          client,
          controller.signal,
        );
        if (!cancelled) {
          setState((current) => ({
            ...current,
            outcome: { locations, ok: true },
          }));
        }
      } catch (error: unknown) {
        // Aborts happen only when this attempt was superseded/unmounted; the
        // newer attempt owns the state then.
        if (!cancelled && !controller.signal.aborted) {
          setState((current) => ({
            ...current,
            outcome: { error, ok: false },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, reloadNonce, sessionEmail, status]);

  const selectLocation = useCallback((locationId: string): void => {
    setState((current) => {
      const authorized =
        current.outcome?.ok === true ? current.outcome.locations : null;
      return {
        ...current,
        preference: isAuthorizedLocation(authorized, locationId)
          ? locationId
          : current.preference,
      };
    });
  }, []);

  const reloadLocations = useCallback((): void => {
    // Drops any settled outcome synchronously in this event handler, so the
    // derived status flips to loading and stale outcomes cannot survive.
    setReloadNonce((nonce) => nonce + 1);
    setState((current) => ({ ...current, outcome: null }));
  }, []);

  const value = useMemo<LocationContextValue>(() => {
    const outcome = state.outcome;
    const status: LocationContextStatus =
      outcome === null ? "loading" : outcome.ok ? "ready" : "error";
    const locations = outcome?.ok === true ? toMetaList(outcome.locations) : [];
    // The selection preference is validated against the FRESH list every
    // time; the deterministic fallback is the first backend entry.
    const resolved =
      outcome?.ok === true
        ? bootstrapSucceeded(outcome.locations, state.preference)
        : null;
    const selectedId = resolved?.phase === "ready" ? resolved.selectedId : null;
    const location =
      selectedId !== null
        ? (locations.find((entry) => entry.locationId === selectedId) ?? null)
        : null;
    return {
      error: outcome?.ok === false ? outcome.error : null,
      location,
      locations,
      reloadLocations,
      selectLocation,
      status,
    };
  }, [state, reloadLocations, selectLocation]);

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

/** Full bootstrap/selection surface for shell-level consumers. */
export function useDashboardLocations(): LocationContextValue {
  const context = useContext(LocationContext);
  if (context === null) {
    throw new Error(
      "useDashboardLocations must be used within a LocationProvider",
    );
  }
  return context;
}

/** Currently selected operational location (null while not ready). */
export function useDashboardLocation(): DashboardLocationMeta | null {
  return useDashboardLocations().location;
}
