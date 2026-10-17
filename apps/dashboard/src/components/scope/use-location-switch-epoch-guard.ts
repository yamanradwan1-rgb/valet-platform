"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  ScopeGenerationGuard,
  type ScopeRequestTicket,
} from "../../lib/scope/scope-generation";
import type { SelectedScopeEpoch } from "../foundation/selected-scope-state";
import { currentScopeLostAuthority } from "./location-switch-recovery";
import {
  locationSwitchRequestKey,
  switchScopeKey,
  type LocationSwitchTicket,
} from "./location-switch-state";
import type { LocationSwitcherInput } from "./location-switch-types";

type GuardedTicket = LocationSwitchTicket & {
  readonly request: ScopeRequestTicket;
};

export function useLocationSwitchEpochGuard(input: LocationSwitcherInput) {
  const [guard] = useState(() => new ScopeGenerationGuard());
  const inputRef = useRef(input);

  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);

  const begin = useCallback((): GuardedTicket => {
    const current = inputRef.current;
    const request = guard.begin();
    return {
      currentPath: current.currentPath,
      identityGeneration: current.identityGeneration,
      request,
      requestGeneration: request.generation,
      scopeKey: switchScopeKey(current.currentScope),
      selectionRevision: current.selectionRevision,
      sessionGeneration: current.sessionGeneration,
    };
  }, [guard]);

  const isCurrent = useCallback(
    (ticket: GuardedTicket): boolean => {
      const current = inputRef.current;
      return (
        guard.isCurrent(ticket.request) &&
        ticket.identityGeneration === current.identityGeneration &&
        ticket.identityGeneration === current.liveIdentityGeneration() &&
        ticket.sessionGeneration === current.sessionGeneration &&
        ticket.sessionGeneration === current.liveSessionGeneration() &&
        ticket.selectionRevision === current.selectionRevision &&
        ticket.currentPath === current.currentPath &&
        ticket.scopeKey === switchScopeKey(current.currentScope)
      );
    },
    [guard],
  );

  const recoverCurrent = useCallback(
    async (ticket: GuardedTicket, requestSuffix: string): Promise<boolean> => {
      const current = inputRef.current;
      const lost = await currentScopeLostAuthority({
        accessRequirement: current.accessRequirement,
        api: current.api,
        requestKey: `${locationSwitchRequestKey(ticket, requestSuffix)}:current`,
        scope: current.currentScope,
        signal: ticket.request.signal,
      });
      if (!isCurrent(ticket)) return true;
      if (!lost) return false;
      current.onCurrentScopeInvalid(epochFor(ticket));
      return true;
    },
    [isCurrent],
  );

  const current = useCallback(() => inputRef.current, []);
  return { begin, current, guard, isCurrent, recoverCurrent };
}

export function isLocationSwitchAuthorityLoss(reason: unknown): boolean {
  return (
    reason instanceof DashboardApiError &&
    (reason.kind === "auth" ||
      reason.kind === "authorization" ||
      reason.kind === "entitlement")
  );
}

function epochFor(ticket: LocationSwitchTicket): SelectedScopeEpoch {
  return {
    identityGeneration: ticket.identityGeneration,
    selectionRevision: ticket.selectionRevision,
    sessionGeneration: ticket.sessionGeneration,
  };
}
