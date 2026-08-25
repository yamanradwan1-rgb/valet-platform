"use client";

import React, { createContext, useContext, useMemo } from "react";

import {
  getDevLocationBootstrap,
  type DevLocationBootstrap,
} from "../../lib/app-config";

/**
 * Dashboard location context.
 *
 * INTEGRATION PREREQUISITE: the backend authorizes exact Location IDs for
 * LOCATION_MANAGER but exposes no public endpoint that enumerates the
 * Locations a manager may access. Until that bootstrap contract exists this
 * context holds a single development-configured Location and never pretends
 * to be an authorization source. Server-side authorization by exact
 * Location ID remains the only authority.
 *
 * When a real enumeration/bootstrap endpoint ships, replace the dev
 * bootstrap with a query against it and add location switching here.
 */
export interface DashboardLocationMeta {
  readonly locationId: string;
  readonly organizationId: string | null;
  readonly name: string | null;
  readonly currency: string | null;
  readonly timezone: string | null;
}

interface LocationContextValue {
  readonly location: DashboardLocationMeta | null;
}

const LocationContext = createContext<LocationContextValue>({ location: null });

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<LocationContextValue>(() => {
    const devBootstrap =
      getDevLocationBootstrap() as DevLocationBootstrap | null;
    if (devBootstrap === null) return { location: null };
    return {
      location: {
        locationId: devBootstrap.locationId,
        organizationId: devBootstrap.organizationId,
        name: devBootstrap.name,
        currency: devBootstrap.currency,
        timezone: devBootstrap.timezone,
      },
    };
  }, []);
  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useDashboardLocation(): DashboardLocationMeta | null {
  return useContext(LocationContext).location;
}
