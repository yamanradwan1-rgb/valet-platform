import { describe, expect, it, vi } from "vitest";

import {
  noNavigationAuthority,
  type NavigationAuthority,
} from "../../lib/navigation/navigation-authority";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";
import {
  advanceSelectedScopeState,
  advanceSelectedScopeStateIfCurrentEpoch,
  type SelectedScopeState,
} from "./selected-scope-state";
import { selectedScopeRevalidationKey } from "./selected-scope-revalidation-policy";
import {
  navigationAuthorityKey,
  startNavigationAuthorityCycle,
  visibleNavigationAuthorityState,
  type NavigationAuthorityState,
} from "./use-navigation-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const location = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const scopeA: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location,
};
const scopeB: SelectedDashboardScope = {
  ...scopeA,
  location: {
    ...location,
    locationId: "33333333-3333-4333-8333-333333333333",
    name: "Second",
  },
};
const visitAuthority: NavigationAuthority = {
  ...noNavigationAuthority,
  features: {
    ...noNavigationAuthority.features,
    VISIT_CONTACTS: "ELIGIBLE",
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("navigation authority generations", () => {
  it("keys authority to identity, session, revision, and exact scope", () => {
    const base = navigationAuthorityKey(1, 2, 3, scopeA);
    expect(navigationAuthorityKey(1, 9, 3, scopeA)).not.toBe(base);
    expect(navigationAuthorityKey(9, 2, 3, scopeA)).not.toBe(base);
    expect(navigationAuthorityKey(1, 2, 4, scopeA)).not.toBe(base);
    expect(navigationAuthorityKey(1, 2, 3, scopeB)).not.toBe(base);
  });

  it("starts a fresh cycle for same-ID retry and A to B to A", () => {
    const firstA = navigationAuthorityKey(1, 1, 1, scopeA);
    const retryA = navigationAuthorityKey(1, 1, 2, scopeA);
    const middleB = navigationAuthorityKey(1, 1, 3, scopeB);
    const finalA = navigationAuthorityKey(1, 1, 4, scopeA);
    expect(new Set([firstA, retryA, middleB, finalA]).size).toBe(4);
    expect(selectedScopeRevalidationKey(1, 1, 1, "DASHBOARD", scopeA)).not.toBe(
      selectedScopeRevalidationKey(1, 1, 2, "DASHBOARD", scopeA),
    );
  });

  it("masks old eligible state immediately when the authority key changes", () => {
    const oldKey = navigationAuthorityKey(1, 1, 1, scopeA);
    const newKey = navigationAuthorityKey(1, 2, 1, scopeA);
    const oldState: NavigationAuthorityState = {
      authority: visitAuthority,
      key: oldKey,
      status: "valid",
    };
    expect(visibleNavigationAuthorityState(oldState, newKey)).toEqual({
      authority: null,
      key: newKey,
      status: "checking",
    });
  });

  it("discards a delayed old success even when its promise ignores abort", async () => {
    const guard = new ScopeGenerationGuard();
    const old = deferred<NavigationAuthority>();
    const fresh = deferred<NavigationAuthority>();
    const states: NavigationAuthorityState[] = [];
    startNavigationAuthorityCycle({
      guard,
      key: "old",
      load: () => old.promise,
      publish: (state) => states.push(state),
    });
    startNavigationAuthorityCycle({
      guard,
      key: "fresh",
      load: () => fresh.promise,
      publish: (state) => states.push(state),
    });
    fresh.resolve(noNavigationAuthority);
    await flush();
    old.resolve(visitAuthority);
    await flush();
    expect(states.at(-1)).toEqual({
      authority: noNavigationAuthority,
      key: "fresh",
      status: "valid",
    });
    expect(states).not.toContainEqual({
      authority: visitAuthority,
      key: "old",
      status: "valid",
    });
  });

  it("discards a delayed old failure and keeps the newer successful cycle", async () => {
    const guard = new ScopeGenerationGuard();
    const old = deferred<NavigationAuthority>();
    const states: NavigationAuthorityState[] = [];
    startNavigationAuthorityCycle({
      guard,
      key: "old",
      load: () => old.promise,
      publish: (state) => states.push(state),
    });
    startNavigationAuthorityCycle({
      guard,
      key: "fresh",
      load: () => Promise.resolve(visitAuthority),
      publish: (state) => states.push(state),
    });
    await flush();
    old.reject(new Error("late failure"));
    await flush();
    expect(states.at(-1)).toEqual({
      authority: visitAuthority,
      key: "fresh",
      status: "valid",
    });
    expect(states).not.toContainEqual({
      authority: null,
      key: "old",
      status: "error",
    });
  });

  it("removes an old feature bit immediately on an explicit revocation cycle", async () => {
    const guard = new ScopeGenerationGuard();
    const publish = vi.fn<(state: NavigationAuthorityState) => void>();
    startNavigationAuthorityCycle({
      guard,
      key: "allowed",
      load: () => Promise.resolve(visitAuthority),
      publish,
    });
    await flush();
    startNavigationAuthorityCycle({
      guard,
      key: "revoked",
      load: () => Promise.resolve(noNavigationAuthority),
      publish,
    });
    expect(publish).toHaveBeenLastCalledWith({
      authority: null,
      key: "revoked",
      status: "checking",
    });
    await flush();
    expect(publish).toHaveBeenLastCalledWith({
      authority: noNavigationAuthority,
      key: "revoked",
      status: "valid",
    });
  });

  it("increments selection revision for select, retry/reselect, clear, and identity change", () => {
    const initial: SelectedScopeState = {
      identityGeneration: 1,
      persistence: "sync",
      restorationStatus: "settled",
      selectedScope: null,
      selectionRevision: 0,
    };
    const selected = advanceSelectedScopeState(initial, 1, scopeA);
    const retry = advanceSelectedScopeState(selected, 1, scopeA);
    const cleared = advanceSelectedScopeState(retry, 1, null);
    const switchedIdentity = advanceSelectedScopeState(cleared, 2, scopeA);
    expect(selected.selectionRevision).toBe(1);
    expect(retry.selectionRevision).toBe(2);
    expect(cleared.selectionRevision).toBe(3);
    expect(switchedIdentity.selectionRevision).toBe(1);
  });

  it("does not let a stale scope epoch clear a newer selected scope", () => {
    const first = advanceSelectedScopeState(
      {
        identityGeneration: 1,
        persistence: "sync",
        restorationStatus: "settled",
        selectedScope: null,
        selectionRevision: 0,
      },
      1,
      scopeA,
    );
    const newer = advanceSelectedScopeState(first, 1, scopeB);

    expect(
      advanceSelectedScopeStateIfCurrentEpoch(
        newer,
        { identityGeneration: 1, sessionGeneration: 8 },
        {
          identityGeneration: 1,
          selectionRevision: first.selectionRevision,
          sessionGeneration: 8,
        },
        null,
      ),
    ).toBe(newer);
    expect(
      advanceSelectedScopeStateIfCurrentEpoch(
        newer,
        { identityGeneration: 2, sessionGeneration: 8 },
        {
          identityGeneration: 1,
          selectionRevision: newer.selectionRevision,
          sessionGeneration: 8,
        },
        null,
      ),
    ).toBe(newer);
    expect(
      advanceSelectedScopeStateIfCurrentEpoch(
        newer,
        { identityGeneration: 1, sessionGeneration: 9 },
        {
          identityGeneration: 1,
          selectionRevision: newer.selectionRevision,
          sessionGeneration: 8,
        },
        null,
      ),
    ).toBe(newer);
    expect(
      advanceSelectedScopeStateIfCurrentEpoch(
        newer,
        { identityGeneration: 1, sessionGeneration: 9 },
        {
          identityGeneration: 1,
          selectionRevision: newer.selectionRevision,
          sessionGeneration: 9,
        },
        null,
      ),
    ).toMatchObject({ selectedScope: null, selectionRevision: 3 });
  });
});
