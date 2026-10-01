import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardNavigationItem } from "../../lib/navigation";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { SelectedScopeEpoch } from "../foundation/selected-scope-state";
import type {
  LocationSwitchSourceScope,
  SwitchableDashboardScope,
} from "./location-switch-authority";

export interface LocationSwitcherInput {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly currentPath: string;
  readonly currentScope: LocationSwitchSourceScope;
  readonly identityGeneration: number;
  readonly liveIdentityGeneration: () => number;
  readonly liveSessionGeneration: () => number;
  readonly onCommit: (
    scope: SwitchableDashboardScope,
    destination: string | null,
    navigation: readonly DashboardNavigationItem[],
  ) => void;
  readonly onCurrentScopeInvalid: (epoch: SelectedScopeEpoch) => void;
  readonly onMfaRequired: () => void;
  readonly preserveIndependentRoute: boolean;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}
