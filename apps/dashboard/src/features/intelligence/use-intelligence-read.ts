"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import {
  intelligenceRequestKey,
  type IntelligenceRequestDescriptor,
} from "./intelligence-query-identity";
import { intelligenceScope, type IntelligenceScope } from "./intelligence-scope";

export interface IntelligenceReadContext {
  readonly api: DashboardApiClient;
  readonly scope: IntelligenceScope;
  readonly signal: AbortSignal;
}

export interface IntelligenceReadState<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly loading: boolean;
  readonly requestKey: string | null;
  readonly retry: () => void;
  readonly scope: IntelligenceScope | null;
}

export function useIntelligenceRead<T>(input: {
  readonly descriptor: IntelligenceRequestDescriptor | null;
  readonly enabled?: boolean;
  readonly load: (context: IntelligenceReadContext) => Promise<T>;
}): IntelligenceReadState<T> {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scope = useMemo(
    () => intelligenceScope(dashboard.selectedScope),
    [dashboard.selectedScope],
  );
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [retryRevision, setRetryRevision] = useState(0);
  const loadRef = useRef(input.load);
  useEffect(() => {
    loadRef.current = input.load;
  }, [input.load]);
  const enabled = input.enabled ?? true;
  const requestKey = enabled && scope !== null && input.descriptor !== null
    ? intelligenceRequestKey({
        descriptor: input.descriptor,
        identityGeneration: dashboard.identityGeneration,
        retryRevision,
        scope,
        selectionRevision,
        sessionGeneration: dashboard.sessionGeneration,
      })
    : null;
  const [state, setState] = useState<{
    readonly data: T | null;
    readonly error: unknown;
    readonly requestKey: string | null;
  }>({ data: null, error: null, requestKey: null });

  useEffect(() => {
    if (requestKey === null || scope === null) {
      guard.invalidate();
      return;
    }
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      setState({ data: null, error: null, requestKey: null });
      try {
        const data = await loadRef.current({
          api: dashboard.api,
          scope,
          signal: ticket.signal,
        });
        const settlement = guard.accept(ticket, { kind: "success" as const, data });
        if (disposed || settlement === undefined) return;
        setState({ data: settlement.data, error: null, requestKey });
      } catch (error: unknown) {
        const settlement = guard.accept(ticket, { kind: "failure" as const, error });
        if (disposed || settlement === undefined) return;
        setState({ data: null, error: settlement.error, requestKey });
      }
    });
    return () => {
      disposed = true;
      guard.invalidate();
    };
  }, [dashboard.api, guard, requestKey, scope]);

  const retry = useCallback(() => {
    guard.invalidate();
    setRetryRevision((current) => current + 1);
  }, [guard]);

  if (requestKey === null) {
    return { data: null, error: null, loading: false, requestKey, retry, scope };
  }
  if (state.requestKey !== requestKey) {
    return { data: null, error: null, loading: true, requestKey, retry, scope };
  }
  return {
    data: state.data,
    error: state.error,
    loading: false,
    requestKey,
    retry,
    scope,
  };
}
