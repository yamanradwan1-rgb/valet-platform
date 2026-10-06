import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  listActiveSupervisorScopes,
  listCompanyAdminOrganizations,
  listLocationManagerLocations,
  listLocationManagerOrganizations,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";
import { sameManagementScope } from "./selected-scope-revalidation-policy";
import type { SelectedScopeRestorationHint } from "./selected-scope-restoration-hint";

const RESTORE_PAGE_LIMIT = 100;
const RESTORE_MAX_PAGES = 100;

export interface RestorationDependencies {
  readonly listActiveSupervisorScopes: typeof listActiveSupervisorScopes;
  readonly listCompanyAdminOrganizations: typeof listCompanyAdminOrganizations;
  readonly listLocationManagerLocations: typeof listLocationManagerLocations;
  readonly listLocationManagerOrganizations: typeof listLocationManagerOrganizations;
  readonly resolveCompanyAdminContext: typeof resolveCompanyAdminContext;
}

const productionDependencies: RestorationDependencies = {
  listActiveSupervisorScopes,
  listCompanyAdminOrganizations,
  listLocationManagerLocations,
  listLocationManagerOrganizations,
  resolveCompanyAdminContext,
};

export async function restoreSelectedDashboardScope(
  api: DashboardApiClient,
  hint: SelectedScopeRestorationHint,
  signal?: AbortSignal,
  dependencies: RestorationDependencies = productionDependencies,
): Promise<SelectedDashboardScope | null> {
  if (hint.authority === "COMPANY_ADMIN") {
    const context = await dependencies.resolveCompanyAdminContext(
      api,
      hint.organizationId,
      hint.scope,
      signal,
    );
    if (
      context.organization.organizationId !== hint.organizationId ||
      !sameManagementScope(context.scope, hint.scope)
    ) return null;
    if (hint.scope.kind === "LOCATION" && (
      context.selectedLocation?.locationId !== hint.scope.locationId ||
      context.selectedLocation.status !== "ACTIVE"
    )) return null;
    return { authority: "COMPANY_ADMIN", context };
  }

  if (hint.authority === "SUPERVISOR") {
    const candidates = await dependencies.listActiveSupervisorScopes(api, signal);
    const context = candidates.find((candidate) =>
      candidate.organization.organizationId === hint.organizationId &&
      candidate.membershipId === hint.membershipId &&
      candidate.location.locationId === hint.locationId &&
      candidate.activeShift.locationId === hint.locationId &&
      candidate.activeShift.shiftId === hint.shiftId,
    );
    return context === undefined ? null : { authority: "SUPERVISOR", context };
  }

  const organization = await findOrganization(
    api,
    hint.organizationId,
    hint.authority === "COMPANY_ADMIN_SUBSCRIPTION"
      ? dependencies.listCompanyAdminOrganizations
      : dependencies.listLocationManagerOrganizations,
    signal,
  );
  if (organization === null) return null;
  if (hint.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return { authority: hint.authority, organization };
  }
  if (hint.authority === "LOCATION_MANAGER_GRANT_SET") {
    return { authority: hint.authority, organization };
  }

  const location = await findLocation(
    api,
    hint.organizationId,
    hint.locationId,
    dependencies.listLocationManagerLocations,
    signal,
  );
  if (location === null || location.status !== "ACTIVE") return null;
  return { authority: "LOCATION_MANAGER", organization, location };
}

export function isDefinitiveRestorationFailure(reason: unknown): boolean {
  return reason instanceof DashboardApiError &&
    (reason.kind === "auth" || reason.kind === "authorization");
}

async function findOrganization(
  api: DashboardApiClient,
  organizationId: string,
  list: typeof listCompanyAdminOrganizations,
  signal?: AbortSignal,
) {
  return findPaged(
    (cursor) => list(
      api,
      { ...(cursor === undefined ? {} : { cursor }), limit: RESTORE_PAGE_LIMIT },
      signal,
    ),
    organizationId,
    (item) => item.organizationId,
  );
}

async function findLocation(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  list: typeof listLocationManagerLocations,
  signal?: AbortSignal,
) {
  return findPaged(
    (cursor) => list(
      api,
      organizationId,
      { ...(cursor === undefined ? {} : { cursor }), limit: RESTORE_PAGE_LIMIT },
      signal,
    ),
    locationId,
    (item) => item.locationId,
  );
}

async function findPaged<T>(
  load: (cursor?: string) => Promise<{ readonly items: readonly T[]; readonly nextCursor: string | null }>,
  targetId: string,
  idOf: (item: T) => string,
): Promise<T | null> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < RESTORE_MAX_PAGES; page += 1) {
    const response = await load(cursor);
    const exact = response.items.find((item) => idOf(item) === targetId);
    if (exact !== undefined) return exact;
    if (response.nextCursor === null) return null;
    if (seen.has(response.nextCursor)) {
      throw new Error("Scope restoration pagination did not advance.");
    }
    seen.add(response.nextCursor);
    cursor = response.nextCursor;
  }
  throw new Error("Scope restoration pagination exceeded its bound.");
}
