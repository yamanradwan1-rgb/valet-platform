"use client";

import { useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import {
  VehicleDirectoryLoader,
  initialVehicleDirectoryState,
  type VehicleDirectoryState,
} from "./vehicles-directory-loader";
import type { StaffVehicleDirectoryRow } from "./vehicles-directory-api";

export interface UseVehicleDirectoryOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly locationId: string | null;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

export interface UseVehicleDirectoryResult {
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly retry: () => void;
  readonly rows: StaffVehicleDirectoryRow[];
  readonly truncated: boolean;
}

/**
 * Thin React binding over the vehicle-directory loader (DEC-066 §11): loads
 * the authoritative page for the active Location, revalidates on reconnect
 * and on returning to a visible tab, and exposes an explicit retry for the
 * error state. Read-only — no mutation path exists on this surface.
 */
export function useVehicleDirectory(
  options: UseVehicleDirectoryOptions,
): UseVehicleDirectoryResult {
  const { client: customClient, locationId, onAuthorizationLoss } = options;
  const auth = useOptionalStaffAuth();
  const status = auth?.status ?? "unauthenticated";
  const sessionGeneration = auth?.sessionGeneration ?? 0;
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
        onAuthorizationLoss,
      }),
    [customClient, authClient, onAuthorizationLoss],
  );

  const [state, setState] = useState<VehicleDirectoryState>(
    initialVehicleDirectoryState,
  );
  const [loader] = useState(
    () =>
      new VehicleDirectoryLoader({
        client: apiClient,
        onStateChange: setState,
      }),
  );

  useEffect(() => {
    loader.setClient(apiClient);
  }, [loader, apiClient]);

  useEffect(() => {
    // Effect cleanup must stay RECOVERABLE for the same component instance:
    // React StrictMode (Next dev default) runs mount→cleanup→remount, and a
    // permanent destroy here would poison the remounted cycle into an
    // eternal loading state. reset() only aborts the in-flight request and
    // clears held state; destroy() remains reserved for real teardown.
    return () => {
      loader.reset();
    };
  }, [loader]);

  const authenticated = status === "authenticated" && locationId !== null;

  useEffect(() => {
    if (!authenticated || locationId === null) return;
    void loader.load(locationId);
  }, [loader, authenticated, locationId, sessionGeneration]);

  useEffect(() => {
    // DEC-066 §11 / DEC-063: reconnect and tab-return trigger authoritative
    // revalidation of this read-only surface.
    const revalidate = (): void => {
      if (!authenticated || locationId === null) return;
      void loader.load(locationId);
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loader, authenticated, locationId]);

  const retry = (): void => {
    if (locationId !== null) void loader.load(locationId);
  };

  return {
    error: state.error,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    retry,
    rows: state.response?.rows ?? [],
    truncated: state.response?.truncated ?? false,
  };
}
