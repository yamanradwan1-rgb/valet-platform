"use client";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { SelectedScopeEpoch } from "../foundation/selected-scope-state";
import type {
  LocationSwitchSourceScope,
  SwitchableDashboardScope,
} from "./location-switch-authority";
import { LocationSwitchMenu } from "./location-switch-menu";
import { useLocationSwitcher } from "./use-location-switcher";

export function LocationSwitchControl(props: {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly onCommit: (
    scope: SwitchableDashboardScope,
    destination: string | null,
  ) => void;
  readonly onCurrentScopeInvalid: (epoch: SelectedScopeEpoch) => void;
  readonly onMfaRequired: () => void;
  readonly preserveIndependentRoute?: boolean;
  readonly scope: LocationSwitchSourceScope;
  readonly selectedLabel: string;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}) {
  const auth = useStaffAuth();
  const { t } = useDashboardLocale();
  const controller = useLocationSwitcher({
    accessRequirement: props.accessRequirement,
    api: props.api,
    currentPath: props.currentPath,
    currentScope: props.scope,
    identityGeneration: props.identityGeneration,
    liveIdentityGeneration: () => auth.client.getIdentityGeneration(),
    liveSessionGeneration: () => auth.client.getSessionGeneration(),
    onCommit: props.onCommit,
    onCurrentScopeInvalid: props.onCurrentScopeInvalid,
    onMfaRequired: props.onMfaRequired,
    preserveIndependentRoute: props.preserveIndependentRoute ?? false,
    selectionRevision: props.selectionRevision,
    sessionGeneration: props.sessionGeneration,
  });
  return (
    <LocationSwitchMenu
      controller={controller}
      labels={{
        allLocations: t("allLocations"),
        changeScope: t("changeScope"),
        inactiveHistorical: t("inactiveHistorical"),
        loadError: t("loadError"),
        loadMore: t("loadMore"),
        loading: t("loading"),
        noneAvailable: t("noEligibleScope"),
        retry: t("retry"),
        selectLocation: t("selectLocation"),
      }}
      selectedLabel={props.selectedLabel}
    />
  );
}
