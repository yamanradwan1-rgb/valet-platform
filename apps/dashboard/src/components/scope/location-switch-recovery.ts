import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { revalidateSelectedScope } from "../foundation/revalidate-selected-scope";
import { shouldInvalidateSelectedScopeAfterRouteDenial } from "../foundation/use-selected-scope-revalidation";
import type { LocationSwitchSourceScope } from "./location-switch-authority";

export async function currentScopeLostAuthority(input: {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly requestKey: string;
  readonly scope: LocationSwitchSourceScope;
  readonly signal: AbortSignal;
}): Promise<boolean> {
  try {
    const result = await revalidateSelectedScope(
      input.api,
      input.scope,
      input.accessRequirement,
      input.signal,
      input.requestKey,
    );
    if (result.status === "valid") return false;
    if (result.status === "entitlement") return true;
    if (result.selectedScopeInvalid === true) return true;
    return shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: input.accessRequirement,
      api: input.api,
      baseRequestKey: input.requestKey,
      selectedScope: input.scope,
      signal: input.signal,
    });
  } catch (reason: unknown) {
    return shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: input.accessRequirement,
      api: input.api,
      baseRequestKey: input.requestKey,
      reason,
      selectedScope: input.scope,
      signal: input.signal,
    });
  }
}
