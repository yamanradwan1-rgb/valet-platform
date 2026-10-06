import { staffAuthSessionContinuitySchema } from "@valet/contracts";

import type { SelectedDashboardScope } from "../scope";

export const SELECTED_SCOPE_RESTORATION_KEY =
  "vaylet_dashboard_scope_restore_v1";

interface RestoreBase {
  readonly version: 1;
  readonly staffAuthSessionId: string;
  readonly organizationId: string;
}

export type SelectedScopeRestorationHint =
  | (RestoreBase & {
      readonly authority: "COMPANY_ADMIN";
      readonly scope:
        | { readonly kind: "ALL_LOCATIONS" }
        | { readonly kind: "LOCATION"; readonly locationId: string };
    })
  | (RestoreBase & { readonly authority: "COMPANY_ADMIN_SUBSCRIPTION" })
  | (RestoreBase & {
      readonly authority: "LOCATION_MANAGER";
      readonly locationId: string;
    })
  | (RestoreBase & { readonly authority: "LOCATION_MANAGER_GRANT_SET" })
  | (RestoreBase & {
      readonly authority: "SUPERVISOR";
      readonly membershipId: string;
      readonly locationId: string;
      readonly shiftId: string;
    });

export type RestorationHintReadResult =
  | { readonly kind: "valid"; readonly hint: SelectedScopeRestorationHint }
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" };

export interface ScopeRestorationStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function restorationHintFromScope(
  scope: SelectedDashboardScope,
  staffAuthSessionId: string | null,
): SelectedScopeRestorationHint | null {
  if (!isUuid(staffAuthSessionId)) return null;
  if (scope.authority === "COMPANY_ADMIN") {
    return {
      authority: scope.authority,
      organizationId: scope.context.organization.organizationId,
      scope: scope.context.scope,
      staffAuthSessionId,
      version: 1,
    };
  }
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return baseHint(scope.authority, scope.organization.organizationId, staffAuthSessionId);
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return {
      ...baseHint(scope.authority, scope.organization.organizationId, staffAuthSessionId),
      locationId: scope.location.locationId,
    };
  }
  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") {
    return baseHint(scope.authority, scope.organization.organizationId, staffAuthSessionId);
  }
  return {
    ...baseHint(scope.authority, scope.context.organization.organizationId, staffAuthSessionId),
    locationId: scope.context.location.locationId,
    membershipId: scope.context.membershipId,
    shiftId: scope.context.activeShift.shiftId,
  };
}

export function readSelectedScopeRestorationHint(
  storage: ScopeRestorationStorage | null = browserSessionStorage(),
): RestorationHintReadResult {
  if (storage === null) return { kind: "unavailable" };
  try {
    const raw = storage.getItem(SELECTED_SCOPE_RESTORATION_KEY);
    if (raw === null) return { kind: "missing" };
    return parseSelectedScopeRestorationHint(raw);
  } catch {
    return { kind: "unavailable" };
  }
}

export function writeSelectedScopeRestorationHint(
  hint: SelectedScopeRestorationHint,
  storage: ScopeRestorationStorage | null = browserSessionStorage(),
): boolean {
  if (storage === null) return false;
  if (!removeSelectedScopeRestorationHint(storage)) return false;
  try {
    storage.setItem(SELECTED_SCOPE_RESTORATION_KEY, JSON.stringify(hint));
    return true;
  } catch {
    removeSelectedScopeRestorationHint(storage);
    return false;
  }
}

export function removeSelectedScopeRestorationHint(
  storage: ScopeRestorationStorage | null = browserSessionStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.removeItem(SELECTED_SCOPE_RESTORATION_KEY);
    return true;
  } catch {
    try {
      storage.setItem(SELECTED_SCOPE_RESTORATION_KEY, "");
      return true;
    } catch {
      return false;
    }
  }
}

export function parseSelectedScopeRestorationHint(
  raw: string,
): RestorationHintReadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  const hint = strictHint(value);
  return hint === null ? { kind: "invalid" } : { kind: "valid", hint };
}

function strictHint(value: unknown): SelectedScopeRestorationHint | null {
  if (!plainObject(value) || value.version !== 1) return null;
  if (!isUuid(value.staffAuthSessionId) || !isUuid(value.organizationId)) return null;
  const authority = value.authority;
  if (authority === "COMPANY_ADMIN") return parseCompanyAdmin(value);
  if (authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return exactKeys(value, ["authority", "organizationId", "staffAuthSessionId", "version"])
      ? value as unknown as SelectedScopeRestorationHint : null;
  }
  if (authority === "LOCATION_MANAGER_GRANT_SET") {
    return exactKeys(value, ["authority", "organizationId", "staffAuthSessionId", "version"])
      ? value as unknown as SelectedScopeRestorationHint : null;
  }
  if (authority === "LOCATION_MANAGER") {
    return exactKeys(value, ["authority", "locationId", "organizationId", "staffAuthSessionId", "version"]) && isUuid(value.locationId)
      ? value as unknown as SelectedScopeRestorationHint : null;
  }
  if (authority === "SUPERVISOR") {
    return exactKeys(value, ["authority", "locationId", "membershipId", "organizationId", "shiftId", "staffAuthSessionId", "version"]) &&
      isUuid(value.locationId) && isUuid(value.membershipId) && isUuid(value.shiftId)
      ? value as unknown as SelectedScopeRestorationHint : null;
  }
  return null;
}

function parseCompanyAdmin(
  value: Record<string, unknown>,
): SelectedScopeRestorationHint | null {
  if (!exactKeys(value, ["authority", "organizationId", "scope", "staffAuthSessionId", "version"]) || !plainObject(value.scope)) return null;
  if (value.scope.kind === "ALL_LOCATIONS" && exactKeys(value.scope, ["kind"])) {
    return value as unknown as SelectedScopeRestorationHint;
  }
  if (value.scope.kind === "LOCATION" && exactKeys(value.scope, ["kind", "locationId"]) && isUuid(value.scope.locationId)) {
    return value as unknown as SelectedScopeRestorationHint;
  }
  return null;
}

function baseHint<A extends SelectedScopeRestorationHint["authority"]>(
  authority: A,
  organizationId: string,
  staffAuthSessionId: string,
) {
  return { authority, organizationId, staffAuthSessionId, version: 1 as const };
}

function browserSessionStorage(): ScopeRestorationStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    staffAuthSessionContinuitySchema.safeParse(value).success;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}
