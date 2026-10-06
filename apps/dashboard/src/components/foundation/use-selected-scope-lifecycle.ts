"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";
import {
  isDefinitiveRestorationFailure,
  restoreSelectedDashboardScope,
} from "./selected-scope-restoration";
import {
  readSelectedScopeRestorationHint,
  removeSelectedScopeRestorationHint,
  restorationHintFromScope,
  writeSelectedScopeRestorationHint,
} from "./selected-scope-restoration-hint";
import {
  advanceSelectedScopeState,
  advanceSelectedScopeStateIfCurrentEpoch,
  initialSelectedScopeState,
  settleSelectedScopeRestorationIfCurrentEpoch,
  type SelectedScopeEpoch,
  type SelectedScopeState,
} from "./selected-scope-state";

export interface SelectedScopeLifecycle {
  readonly clearScopeIfEpoch: (epoch: SelectedScopeEpoch) => void;
  readonly selectedScope: SelectedDashboardScope | null;
  readonly restorationStatus: "checking" | "settled";
  readonly selectionRevision: number;
  readonly selectScope: (scope: SelectedDashboardScope) => void;
  readonly clearScope: () => void;
}

export function useSelectedScopeLifecycle(): SelectedScopeLifecycle {
  const auth = useStaffAuth();
  const { client, identityGeneration } = auth;
  const [state, setState] = useState<SelectedScopeState>(() =>
    initialSelectedScopeState(identityGeneration),
  );
  const [restoreGuard] = useState(() => new ScopeGenerationGuard());
  const api = useMemo(() => new DashboardApiClient({ auth: client }), [client]);
  const currentState = state.identityGeneration === identityGeneration
    ? state
    : initialSelectedScopeState(identityGeneration);

  useEffect(() => {
    if (state.identityGeneration === identityGeneration) return;
    restoreGuard.invalidate();
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setState(initialSelectedScopeState(identityGeneration));
    });
    return () => {
      active = false;
    };
  }, [identityGeneration, restoreGuard, state.identityGeneration]);

  useEffect(() => {
    if (auth.status === "initializing" || auth.status === "refresh-unavailable") return;
    let active = true;
    const settleAsync = (
      scope: SelectedDashboardScope | null,
      persistence: "preserve" | "sync",
    ) => {
      void Promise.resolve().then(() => {
        if (active) setState((current) => settle(current, scope, persistence));
      });
    };
    if (auth.status !== "authenticated") {
      restoreGuard.invalidate();
      removeSelectedScopeRestorationHint();
      void Promise.resolve().then(() => {
        if (!active) return;
        setState((current) =>
          current.identityGeneration === identityGeneration &&
          current.selectedScope === null && current.restorationStatus === "settled"
            ? current
            : advanceSelectedScopeState(current, identityGeneration, null),
        );
      });
      return () => {
        active = false;
      };
    }
    if (
      state.identityGeneration !== identityGeneration ||
      state.restorationStatus !== "checking"
    ) return;

    const read = readSelectedScopeRestorationHint();
    if (read.kind === "missing") {
      settleAsync(null, "sync");
      return deactivate;
    }
    if (read.kind === "invalid") {
      removeSelectedScopeRestorationHint();
      settleAsync(null, "sync");
      return deactivate;
    }
    if (read.kind === "unavailable") {
      settleAsync(null, "preserve");
      return deactivate;
    }
    const continuity = client.getStaffAuthSessionId();
    if (continuity === null || continuity !== read.hint.staffAuthSessionId) {
      removeSelectedScopeRestorationHint();
      settleAsync(null, "sync");
      return deactivate;
    }

    const request = restoreGuard.begin();
    const expected: SelectedScopeEpoch = {
      identityGeneration,
      selectionRevision: state.selectionRevision,
      sessionGeneration: auth.sessionGeneration,
    };
    void restoreSelectedDashboardScope(api, read.hint, request.signal).then(
      (scope) => {
        if (!active || !restoreGuard.isCurrent(request)) return;
        setState((current) => settleCurrent(current, expected, scope, "sync"));
      },
      (reason: unknown) => {
        if (!active || !restoreGuard.isCurrent(request)) return;
        setState((current) => settleCurrent(
          current,
          expected,
          null,
          isDefinitiveRestorationFailure(reason) ? "sync" : "preserve",
        ));
      },
    );
    return () => {
      active = false;
      restoreGuard.invalidate();
    };

    function deactivate() {
      active = false;
    }
    function settle(
      current: SelectedScopeState,
      scope: SelectedDashboardScope | null,
      persistence: "preserve" | "sync",
    ) {
      return settleCurrent(
        current,
        {
          identityGeneration,
          selectionRevision: state.selectionRevision,
          sessionGeneration: auth.sessionGeneration,
        },
        scope,
        persistence,
      );
    }
    function settleCurrent(
      current: SelectedScopeState,
      expected: SelectedScopeEpoch,
      scope: SelectedDashboardScope | null,
      persistence: "preserve" | "sync",
    ) {
      return settleSelectedScopeRestorationIfCurrentEpoch(
        current,
        {
          identityGeneration: client.getIdentityGeneration(),
          sessionGeneration: client.getSessionGeneration(),
        },
        expected,
        scope,
        persistence,
      );
    }
  }, [
    api,
    auth.sessionGeneration,
    auth.status,
    client,
    identityGeneration,
    restoreGuard,
    state.identityGeneration,
    state.restorationStatus,
    state.selectionRevision,
  ]);

  useEffect(() => {
    if (
      state.identityGeneration !== identityGeneration ||
      state.persistence !== "sync" ||
      state.restorationStatus !== "settled"
    ) return;
    if (state.selectedScope === null) {
      removeSelectedScopeRestorationHint();
      return;
    }
    const hint = restorationHintFromScope(
      state.selectedScope,
      client.getStaffAuthSessionId(),
    );
    if (hint === null) {
      removeSelectedScopeRestorationHint();
      return;
    }
    writeSelectedScopeRestorationHint(hint);
  }, [client, identityGeneration, state]);

  const selectScope = useCallback(
    (scope: SelectedDashboardScope) => {
      setState((current) => advanceSelectedScopeState(current, identityGeneration, scope));
    },
    [identityGeneration],
  );
  const clearScope = useCallback(() => {
    setState((current) => advanceSelectedScopeState(current, identityGeneration, null));
  }, [identityGeneration]);
  const clearScopeIfEpoch = useCallback((expected: SelectedScopeEpoch) => {
    setState((current) =>
      advanceSelectedScopeStateIfCurrentEpoch(
        current,
        {
          identityGeneration: client.getIdentityGeneration(),
          sessionGeneration: client.getSessionGeneration(),
        },
        expected,
        null,
      ));
  }, [client]);

  return {
    clearScope,
    clearScopeIfEpoch,
    restorationStatus: currentState.restorationStatus,
    selectedScope: currentState.selectedScope,
    selectionRevision: currentState.selectionRevision,
    selectScope,
  };
}
