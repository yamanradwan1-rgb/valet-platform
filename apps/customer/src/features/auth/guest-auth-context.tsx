'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  GUEST_CONTEXT_CHANGED_EVENT,
  GuestApiClient,
} from '../../lib/api/guest-api-client';
import {
  beginGuestContextSwitchState,
  completedBootstrapState,
  continueCurrentGuestVisitState,
  failedBootstrapState,
  failedGuestContextSwitchState,
  retryGuestAuthBootstrapTransport,
  runGuestAuthBootstrap,
  switchGuestBrowserContextTransport,
  type GuestAuthBootstrapStage,
  type GuestContextConflictScope,
  type GuestTokenBootstrapState,
} from './guest-auth-bootstrap';
import { extractGuestFragmentToken } from './guest-token-adapter';

export {
  beginGuestContextSwitchState,
  bootstrapGuestAuthTransport,
  continueCurrentGuestVisitState,
  failedGuestContextSwitchState,
  isRetryableGuestAuthBootstrapFailure,
  retryGuestAuthBootstrapTransport,
  switchGuestBrowserContextTransport,
} from './guest-auth-bootstrap';
export type { GuestContextConflictScope, GuestTokenBootstrapState } from './guest-auth-bootstrap';

interface GuestAuthContextValue {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly contextConflictScope: GuestContextConflictScope | null;
  readonly isTokenBootstrapComplete: boolean;
  readonly isBootstrapTemporarilyUnavailable: boolean;
  readonly isContextSwitching: boolean;
  readonly isContextSwitchOutcomeAmbiguous: boolean;
  readonly continueCurrentVisit: () => void;
  readonly openNewVisit: () => Promise<void>;
  readonly retryBootstrap: () => Promise<void>;
  readonly setToken: (token: string | null) => void;
}

const GuestAuthContext = createContext<GuestAuthContextValue | null>(null);

export function GuestAuthProvider({
  children,
  initialToken,
}: {
  readonly children: React.ReactNode;
  readonly initialToken?: string | null;
}) {
  const [bootstrap, setBootstrap] = useState<GuestTokenBootstrapState>(() => ({
    token: initialToken ?? null,
    client:
      initialToken === undefined || initialToken === null
        ? null
        : new GuestApiClient(initialToken),
    contextConflictScope: null,
    isComplete: initialToken !== undefined,
    isContextSwitching: false,
    isSwitchOutcomeAmbiguous: false,
    isTemporarilyUnavailable: false,
    retryStage: null,
  }));

  useEffect(() => {
    if (initialToken !== undefined) return;

    let isActive = true;
    queueMicrotask(async () => {
      if (!isActive) return;
      const fragmentToken = extractGuestFragmentToken();
      const enrollmentEnabled =
        process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === 'true';
      let retryStage: GuestAuthBootstrapStage =
        fragmentToken === null ? 'RECONCILE_SWITCH' : 'PREPARE';
      try {
        const result = await runGuestAuthBootstrap(
          fragmentToken,
          enrollmentEnabled,
          (stage) => {
            retryStage = stage;
          },
        );
        if (!isActive) return;
        setBootstrap(completedBootstrapState(result));
      } catch (error) {
        if (!isActive) return;
        setBootstrap(
          failedBootstrapState(
            fragmentToken,
            enrollmentEnabled,
            error,
            retryStage,
          ),
        );
      }
    });

    return () => {
      isActive = false;
    };
  }, [initialToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onContextChanged = () => {
      setBootstrap((current) => ({
        ...current,
        token: null,
        client: GuestApiClient.browserSession(),
        contextConflictScope: null,
        isComplete: true,
        isContextSwitching: false,
        isSwitchOutcomeAmbiguous: false,
        isTemporarilyUnavailable: false,
        retryStage: null,
      }));
    };
    window.addEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChanged);
    return () => window.removeEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChanged);
  }, []);

  const retryBootstrap = useCallback(async () => {
    if (!bootstrap.isTemporarilyUnavailable || bootstrap.retryStage === null) return;

    const fragmentToken = bootstrap.token;
    const enrollmentEnabled =
      process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === 'true';
    let retryStage = bootstrap.retryStage;
    setBootstrap({ ...bootstrap, isComplete: false });

    try {
      const result = await retryGuestAuthBootstrapTransport(
        fragmentToken,
        enrollmentEnabled,
        retryStage,
        (stage) => {
          retryStage = stage;
        },
      );
      setBootstrap(completedBootstrapState(result));
    } catch (error) {
      setBootstrap(
        failedBootstrapState(
          fragmentToken,
          enrollmentEnabled,
          error,
          retryStage,
        ),
      );
    }
  }, [bootstrap]);

  const continueCurrentVisit = useCallback(() => {
    setBootstrap(continueCurrentGuestVisitState);
  }, []);

  const openNewVisit = useCallback(async () => {
    if (
      bootstrap.contextConflictScope === null ||
      bootstrap.token === null ||
      bootstrap.isContextSwitching
    ) {
      return;
    }
    const fragmentToken = bootstrap.token;
    setBootstrap(beginGuestContextSwitchState(bootstrap));
    try {
      await switchGuestBrowserContextTransport(new GuestApiClient(fragmentToken));
      setBootstrap(
        completedBootstrapState({
          token: null,
          client: GuestApiClient.browserSession(),
          contextConflictScope: null,
        }),
      );
    } catch (error) {
      setBootstrap(failedGuestContextSwitchState(bootstrap, error));
    }
  }, [bootstrap]);

  const setToken = useCallback((token: string | null) => {
    setBootstrap({
      token,
      client: token === null ? null : new GuestApiClient(token),
      contextConflictScope: null,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    });
  }, []);

  const {
    token,
    client,
    contextConflictScope,
    isComplete: isTokenBootstrapComplete,
    isContextSwitching,
    isSwitchOutcomeAmbiguous: isContextSwitchOutcomeAmbiguous,
    isTemporarilyUnavailable: isBootstrapTemporarilyUnavailable,
  } = bootstrap;

  const value = useMemo(
    () => ({
      token,
      client,
      contextConflictScope,
      isTokenBootstrapComplete,
      isBootstrapTemporarilyUnavailable,
      isContextSwitching,
      isContextSwitchOutcomeAmbiguous,
      continueCurrentVisit,
      openNewVisit,
      retryBootstrap,
      setToken,
    }),
    [
      token,
      client,
      contextConflictScope,
      isTokenBootstrapComplete,
      isBootstrapTemporarilyUnavailable,
      isContextSwitching,
      isContextSwitchOutcomeAmbiguous,
      continueCurrentVisit,
      openNewVisit,
      retryBootstrap,
      setToken,
    ],
  );

  return (
    <GuestAuthContext.Provider value={value}>
      {children}
    </GuestAuthContext.Provider>
  );
}

export function useGuestAuth(): GuestAuthContextValue {
  const context = useContext(GuestAuthContext);
  if (!context) {
    throw new Error('useGuestAuth must be used within a GuestAuthProvider');
  }
  return context;
}
