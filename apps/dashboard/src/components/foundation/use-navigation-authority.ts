"use client";

import { useEffect, useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  noNavigationAuthority,
  type NavigationAuthority,
} from "../../lib/navigation/navigation-authority";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import {
  ScopeGenerationGuard,
  type ScopeRequestTicket,
} from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";
import {
  selectedScopeAuthorityKey,
  selectedScopeBaseRequestKey,
} from "./selected-scope-revalidation-policy";

export type NavigationAuthorityState =
  | { readonly authority: null; readonly key: string; readonly status: "checking" | "error" }
  | { readonly authority: NavigationAuthority; readonly key: string; readonly status: "valid" };

export function navigationAuthorityKey(
  sessionGeneration: number,
  identityGeneration: number,
  selectionRevision: number,
  scope: SelectedDashboardScope | null,
): string {
  return [
    sessionGeneration,
    identityGeneration,
    selectionRevision,
    "navigation",
    selectedScopeAuthorityKey(scope),
  ].join(":");
}

export function visibleNavigationAuthorityState(
  settled: NavigationAuthorityState,
  key: string,
): NavigationAuthorityState {
  return settled.key === key
    ? settled
    : { authority: null, key, status: "checking" };
}

export function startNavigationAuthorityCycle(input: {
  readonly guard: ScopeGenerationGuard;
  readonly key: string;
  readonly load: (signal: AbortSignal) => Promise<NavigationAuthority>;
  readonly publish: (state: NavigationAuthorityState) => void;
}): () => void {
  const { guard, key, load, publish } = input;
  const ticket = guard.begin();
  publish({ authority: null, key, status: "checking" });
  void settleNavigationAuthority(ticket, guard, key, load, publish);
  return () => guard.invalidate();
}

async function settleNavigationAuthority(
  ticket: ScopeRequestTicket,
  guard: ScopeGenerationGuard,
  key: string,
  load: (signal: AbortSignal) => Promise<NavigationAuthority>,
  publish: (state: NavigationAuthorityState) => void,
): Promise<void> {
  try {
    const authority = await load(ticket.signal);
    if (guard.isCurrent(ticket)) {
      publish({ authority, key, status: "valid" });
    }
  } catch {
    if (guard.isCurrent(ticket)) {
      publish({ authority: null, key, status: "error" });
    }
  }
}

export function useNavigationAuthority(input: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly registrations: readonly DashboardNavigationRegistration[];
  readonly selectedScope: SelectedDashboardScope | null;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}): NavigationAuthorityState {
  const {
    api,
    identityGeneration,
    registrations,
    selectedScope,
    selectionRevision,
    sessionGeneration,
  } = input;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const key = navigationAuthorityKey(
    sessionGeneration,
    identityGeneration,
    selectionRevision,
    selectedScope,
  );
  const baseRequestKey = selectedScopeBaseRequestKey(
    sessionGeneration,
    identityGeneration,
    selectionRevision,
    selectedScope,
  );
  const [settled, setSettled] = useState<NavigationAuthorityState>({
    authority: null,
    key,
    status: "checking",
  });

  useEffect(
    () =>
      startNavigationAuthorityCycle({
        guard,
        key,
        load: (signal) =>
          selectedScope === null
            ? Promise.resolve(noNavigationAuthority)
            : resolveNavigationAuthority({
                api,
                baseRequestKey,
                registrations,
                selectedScope,
                signal,
              }),
        publish: setSettled,
      }),
    [api, baseRequestKey, guard, key, registrations, selectedScope],
  );

  return visibleNavigationAuthorityState(settled, key);
}
