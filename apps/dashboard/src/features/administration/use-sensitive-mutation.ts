"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import {
  ScopeGenerationGuard,
  type ScopeRequestTicket,
} from "../../lib/scope/scope-generation";
import { administrationCopy } from "./administration-copy";
import { administrationErrorMessage } from "./administration-error";
import { administrationScopeKey } from "./administration-scope";
import { executeSensitiveMutation } from "./sensitive-mutation-executor";

interface MutationState {
  readonly busy: boolean;
  readonly error: string | null;
  readonly key: string;
  readonly mfaOpen: boolean;
}

export function useSensitiveMutation(intentKey: string, onConflict?: () => void) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const scopeKey = `${administrationScopeKey(dashboard)}:mutation:${intentKey}`;
  const currentKeyRef = useRef(scopeKey);
  const mountedRef = useRef(true);
  const [guard] = useState(() => new ScopeGenerationGuard());
  const activeRef = useRef<{ readonly key: string; readonly ticket: ScopeRequestTicket } | null>(null);
  const [state, setState] = useState<MutationState>({
    busy: false,
    error: null,
    key: scopeKey,
    mfaOpen: false,
  });

  useLayoutEffect(() => {
    currentKeyRef.current = scopeKey;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = null;
      guard.invalidate();
    };
  }, [guard, scopeKey]);

  const run = useCallback(async <T,>(
    operation: () => Promise<T>,
    onSuccess?: (result: T) => void,
  ): Promise<void> => {
    const active = activeRef.current;
    if (active?.key === scopeKey && guard.isCurrent(active.ticket)) return;
    const ticket = guard.begin();
    activeRef.current = { key: scopeKey, ticket };
    const isCurrent = () =>
      mountedRef.current &&
      currentKeyRef.current === scopeKey &&
      guard.isCurrent(ticket);
    setState({ busy: true, error: null, key: scopeKey, mfaOpen: false });
    try {
      await executeSensitiveMutation(operation, {
        isCurrent,
        onConflict,
        onError: (reason) =>
          setState({
            busy: true,
            error: administrationErrorMessage(reason),
            key: scopeKey,
            mfaOpen: false,
          }),
        onMfaRequired: () =>
          setState({ busy: true, error: null, key: scopeKey, mfaOpen: true }),
        onSuccess,
      });
    } finally {
      if (isCurrent()) {
        activeRef.current = null;
        setState((current) =>
          current.key === scopeKey ? { ...current, busy: false } : current);
      }
    }
  }, [guard, onConflict, scopeKey]);

  const onMfaAssured = useCallback(() => {
    if (currentKeyRef.current !== scopeKey) return;
    setState((current) =>
      current.key === scopeKey && current.mfaOpen
        ? { ...current, error: t.mfaRetry, mfaOpen: false }
        : current);
  }, [scopeKey, t.mfaRetry]);
  const closeMfa = useCallback(() => {
    if (currentKeyRef.current !== scopeKey) return;
    setState((current) =>
      current.key === scopeKey ? { ...current, mfaOpen: false } : current);
  }, [scopeKey]);
  const visible =
    state.key === scopeKey
      ? state
      : { busy: false, error: null, key: scopeKey, mfaOpen: false };

  return {
    busy: visible.busy,
    error: visible.error,
    mfaOpen: visible.mfaOpen,
    onMfaAssured,
    closeMfa,
    run,
  } as const;
}
