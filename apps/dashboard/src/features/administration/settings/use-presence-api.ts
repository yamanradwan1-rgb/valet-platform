"use client";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { dashboardAuthBoundaryError } from "../../../lib/api/dashboard-api-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { PresenceApi } from "./shift-presence-api";

export function usePresenceApi(company: boolean) {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const live = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const current = useRef(dashboard);
  useLayoutEffect(() => {
    current.current = dashboard;
  }, [dashboard]);
  useLayoutEffect(() => {
    controller.current = new AbortController();
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  const requestOptions = useCallback(() => {
    if (
      !live.current ||
      !controller.current ||
      controller.current.signal.aborted ||
      administrationScopeKey(current.current) !==
        administrationScopeKey(dashboard)
    )
      throw dashboardAuthBoundaryError();
    return {
      signal: controller.current.signal,
      onAuthReconciled: (identity: {
        identityGeneration: number;
        sessionGeneration: number;
      }) => {
        if (
          !live.current ||
          identity.identityGeneration !== dashboard.identityGeneration ||
          identity.sessionGeneration !== dashboard.sessionGeneration
        )
          throw dashboardAuthBoundaryError();
      },
    };
  }, [dashboard]);
  const api = useMemo(
    () =>
      new PresenceApi(dashboard.api, {
        authority:
          scope.authority === "LOCATION_MANAGER"
            ? "LOCATION_MANAGER"
            : "COMPANY_ADMIN",
        organizationId: scope.organizationId,
        locationId: company ? null : scope.locationId,
      }),
    [
      company,
      dashboard,
      scope.authority,
      scope.organizationId,
      scope.locationId,
    ],
  );
  useLayoutEffect(() => {
    api.bindRequests(requestOptions);
  }, [api, requestOptions]);
  return { api, live };
}
