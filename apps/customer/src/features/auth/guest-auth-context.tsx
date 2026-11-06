'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestContextConflictScope, GuestTokenBootstrapState } from './guest-auth-bootstrap';
import { connectGuestAuthNavigation, type GuestAuthNavigation } from './guest-auth-navigation';

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
  const [initialBootstrap] = useState<GuestTokenBootstrapState>(() => ({
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
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const navigation = useRef<GuestAuthNavigation | null>(null);
  const readInitialFragment = initialToken === undefined;

  useEffect(() => {
    const { flow, disconnect } = connectGuestAuthNavigation(
      window, initialBootstrap, setBootstrap, readInitialFragment,
    );
    navigation.current = flow;
    return () => {
      navigation.current = null;
      disconnect();
    };
  }, [initialBootstrap, readInitialFragment]);

  const retryBootstrap = useCallback(async () => {
    await navigation.current?.retryBootstrap(bootstrap);
  }, [bootstrap]);
  const continueCurrentVisit = useCallback(() => {
    navigation.current?.continueCurrentVisit(bootstrap);
  }, [bootstrap]);
  const openNewVisit = useCallback(async () => {
    await navigation.current?.openNewVisit(bootstrap);
  }, [bootstrap]);
  const setToken = useCallback((token: string | null) => {
    navigation.current?.setToken(token);
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
