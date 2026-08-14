'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

import { GuestApiClient } from '../../lib/api/guest-api-client';
import { extractDevFragmentToken } from './guest-token-adapter';

interface GuestAuthContextValue {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
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
  const [token, setToken] = useState<string | null>(() => {
    if (initialToken) return initialToken;
    return extractDevFragmentToken();
  });

  const client = useMemo(() => {
    if (!token) return null;
    return new GuestApiClient(token);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      client,
      setToken,
    }),
    [token, client],
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
