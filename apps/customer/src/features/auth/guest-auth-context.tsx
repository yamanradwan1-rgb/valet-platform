'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { GuestApiClient } from '../../lib/api/guest-api-client';
import { extractDevFragmentToken } from './guest-token-adapter';

interface GuestAuthContextValue {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly isTokenBootstrapComplete: boolean;
  readonly setToken: (token: string | null) => void;
}

const GuestAuthContext = createContext<GuestAuthContextValue | null>(null);

interface GuestTokenBootstrapState {
  readonly token: string | null;
  readonly isComplete: boolean;
}

export function GuestAuthProvider({
  children,
  initialToken,
}: {
  readonly children: React.ReactNode;
  readonly initialToken?: string | null;
}) {
  const [bootstrap, setBootstrap] = useState<GuestTokenBootstrapState>(() => ({
    token: initialToken ?? null,
    isComplete: initialToken !== undefined,
  }));

  useEffect(() => {
    if (initialToken !== undefined) return;

    let isActive = true;
    queueMicrotask(() => {
      if (!isActive) return;
      setBootstrap({
        token: extractDevFragmentToken(),
        isComplete: true,
      });
    });

    return () => {
      isActive = false;
    };
  }, [initialToken]);

  const setToken = useCallback((token: string | null) => {
    setBootstrap({ token, isComplete: true });
  }, []);

  const { token, isComplete: isTokenBootstrapComplete } = bootstrap;

  const client = useMemo(() => {
    if (!token) return null;
    return new GuestApiClient(token);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      client,
      isTokenBootstrapComplete,
      setToken,
    }),
    [token, client, isTokenBootstrapComplete, setToken],
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
