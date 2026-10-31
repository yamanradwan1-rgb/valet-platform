"use client";

import { useCallback, useMemo } from "react";

import { useProtectedDashboard } from "../../../../../components/foundation/protected-dashboard-context";
import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { administrationScopeKey } from "../../../administration-scope";
import { useAuthoritativeRead } from "../../../use-authoritative-read";
import { readStudioSettings } from "./studio-settings-read";
import type { StudioSettingsScope } from "./studio-settings-types";
import { useStudioSettingsMutation } from "./use-studio-settings-mutation";

export function useStudioSettings(options: {
  readonly api: DashboardApiClient;
  readonly scope: StudioSettingsScope;
  readonly enabled?: boolean;
}) {
  const dashboard = useProtectedDashboard();
  const { api, scope } = options;
  const organizationId = "organizationId" in scope ? scope.organizationId : "";
  const locationId = "locationId" in scope ? scope.locationId : "";
  const stableScope = useMemo<StudioSettingsScope>(() => {
    switch (scope.kind) {
      case "company":
        return { kind: "company", organizationId };
      case "management-location":
        return { kind: "management-location", organizationId, locationId };
      case "manager-location":
        return { kind: "manager-location", locationId };
    }
  }, [scope.kind, organizationId, locationId]);
  const key = [
    administrationScopeKey(dashboard), "studio-settings",
    stableScope.kind, organizationId, locationId,
  ].join(":");
  const load = useCallback(
    (signal: AbortSignal) => readStudioSettings(api, stableScope, signal),
    [api, stableScope],
  );
  const read = useAuthoritativeRead(key, load, options.enabled ?? true);
  const mutation = useStudioSettingsMutation({
    api, scope: stableScope, snapshot: read.data, onReload: read.refresh,
    disabled: read.loading || read.error !== null || !(options.enabled ?? true),
  });
  const { error: mutationError, ...mutationActions } = mutation;
  return {
    snapshot: read.data,
    loading: read.loading,
    error: read.error,
    refresh: read.refresh,
    ...mutationActions,
    mutationError,
  } as const;
}
