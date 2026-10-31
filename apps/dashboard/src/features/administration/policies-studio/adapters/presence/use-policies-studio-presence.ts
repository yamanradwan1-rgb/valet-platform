"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import type { ShiftPresenceZone } from "@valet/contracts";
import { useProtectedDashboard } from "../../../../../components/foundation/protected-dashboard-context";
import { useAuthoritativeRead } from "../../../use-authoritative-read";
import { usePresenceApi } from "../../../settings/use-presence-api";
import { useShiftPresenceMutation } from "../../../settings/use-shift-presence-mutation";
import { usePresenceForeground } from "../../../settings/use-presence-foreground";
import { isPresenceDenied } from "../../../settings/shift-presence-errors";
import type {
  PresenceCanonical,
  PresenceCompany,
  PresenceLocation,
} from "../../../settings/shift-presence-api";
import type {
  Field,
  PresencePolicyDraftState,
} from "../../../settings/shift-presence-policy-fields";
import {
  saveStudioPresencePolicy,
  type PresenceWriteOutcome,
} from "./presence-policy-adapter";
import {
  saveStudioPresenceZone,
  studioPresenceZone,
  type StudioPresenceZone,
} from "./presence-zone-adapter";
import { presenceStudioAccess, presenceStudioScopeKey } from "./presence-scope";

async function allAuthorizedZones(
  api: ReturnType<typeof usePresenceApi>["api"],
  signal: AbortSignal,
): Promise<ShiftPresenceZone[]> {
  const items: ShiftPresenceZone[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    if (signal.aborted) throw new Error("Presence read was retired.");
    const page = await api.zones(cursor, signal);
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (seen.has(page.nextCursor))
      throw new Error("Repeated authoritative presence-zone cursor.");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

/** Mount this under a scope-keyed parent, as the existing presence mutation does. */
export function usePoliciesStudioPresence({ company = false }: {
  readonly company?: boolean;
} = {}) {
  const dashboard = useProtectedDashboard();
  const selected = dashboard.selectedScope;
  const scopeKey = presenceStudioScopeKey(dashboard, company);
  const scopeRef = useRef(scopeKey);
  useLayoutEffect(() => { scopeRef.current = scopeKey; }, [scopeKey]);
  const access = presenceStudioAccess(selected, company);
  const enabled = access === "REQUESTABLE";
  const noLocation = access === "NO_LOCATION";
  const { api, live } = usePresenceApi(company);
  const lifetime = useRef({ scopeKey, enabled, live });
  useLayoutEffect(() => {
    lifetime.current = { scopeKey, enabled, live };
  }, [scopeKey, enabled, live]);
  const current = useCallback(
    () => lifetime.current.live.current &&
      lifetime.current.scopeKey === scopeKey &&
      lifetime.current.enabled && scopeRef.current === scopeKey,
    [scopeKey],
  );
  const loadPolicy = useCallback(
    (signal: AbortSignal) => api.policy(signal), [api],
  );
  const policyRead = useAuthoritativeRead(
    `${scopeKey}:studio-policy`, loadPolicy, enabled,
  );
  const locationData = policyRead.data && "overrides" in policyRead.data
    ? policyRead.data : null;
  const loadZones = useCallback(
    (signal: AbortSignal) => allAuthorizedZones(api, signal), [api],
  );
  const zonesRead = useAuthoritativeRead(
    `${scopeKey}:studio-zones`, loadZones,
    enabled && !company && locationData !== null,
  );
  const { refresh: refreshPolicy, replace: replacePolicy } = policyRead;
  const { refresh: refreshZones } = zonesRead;
  const refresh = useCallback(() => {
    if (!current()) return;
    refreshPolicy();
    refreshZones();
  }, [current, refreshPolicy, refreshZones]);
  const onCanonical = useCallback((canonical: PresenceCanonical) => {
    if (!current()) return;
    if (canonical.kind === "POLICY") replacePolicy(canonical.value);
  }, [current, replacePolicy]);
  const mutation = useShiftPresenceMutation(api, onCanonical, refresh);
  usePresenceForeground(refresh, enabled);

  const denied = access === "DENIED" || isPresenceDenied(policyRead.error) ||
    isPresenceDenied(zonesRead.error) || mutation.denied;
  const policyBlocked = !enabled || denied || policyRead.loading ||
    policyRead.error !== null || mutation.blocked;
  const zonesBlocked = policyBlocked || zonesRead.loading ||
    zonesRead.error !== null;
  const policy: PresenceCompany | PresenceLocation | null =
    enabled && !denied ? policyRead.data : null;
  const canEditPolicy = !policyBlocked && (policy?.capabilities.canEdit ?? false);
  const canEditZones = !zonesBlocked && canEditPolicy && locationData !== null;

  async function savePolicyDraft(
    field: Field["field"],
    draft: PresencePolicyDraftState,
    strictConfirmed = false,
  ): Promise<PresenceWriteOutcome> {
    if (!policy || !canEditPolicy || !current()) return "BLOCKED";
    return saveStudioPresencePolicy(policy, field, draft, strictConfirmed, {
      api, mutation, current,
    });
  }

  async function saveZone(zone: StudioPresenceZone): Promise<PresenceWriteOutcome> {
    if (!locationData || !canEditZones || !current()) return "BLOCKED";
    return saveStudioPresenceZone(zone, {
      api, mutation, current, canEdit: canEditZones,
    });
  }

  const snapshot = {
    policy,
    zones: !denied && enabled
      ? (zonesRead.data ?? []).map(studioPresenceZone) : [],
    readiness: locationData && !denied ? locationData.readiness : null,
    policyLoading: enabled && policyRead.loading,
    zonesLoading: enabled && !company && zonesRead.loading,
    error: denied ? null : (policyRead.error ?? zonesRead.error),
    policyError: denied ? null : policyRead.error,
    zonesError: denied ? null : zonesRead.error,
    denied,
    noLocation,
    available: enabled && !denied,
    canEdit: canEditPolicy,
    canEditPolicy,
    canEditZones,
    blocked: policyBlocked,
    zonesBlocked,
    mutationMessage: mutation.message,
  };
  return {
    scopeKey, snapshot, api, mutation,
    actions: {
      refresh,
      savePolicyDraft,
      saveZone,
      loadZone: (id: string) => current() && locationData
        ? api.zone(id).then((value) => studioPresenceZone(value.zone))
        : Promise.resolve(null),
    },
  };
}
