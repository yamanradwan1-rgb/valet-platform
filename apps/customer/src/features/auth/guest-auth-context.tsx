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
import { GuestApiError } from '../../lib/api/api-error';
import { extractGuestFragmentToken } from './guest-token-adapter';

interface GuestAuthContextValue {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly isTokenBootstrapComplete: boolean;
  readonly setToken: (token: string | null) => void;
}

const GuestAuthContext = createContext<GuestAuthContextValue | null>(null);

interface GuestTokenBootstrapState {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly isComplete: boolean;
}

interface GuestAuthBootstrapResult {
  readonly token: string | null;
  readonly client: GuestApiClient;
}

function isAmbiguousExchangeFailure(error: unknown): boolean {
  return (
    error instanceof GuestApiError &&
    (error.isNetworkError || (error.status >= 500 && error.status <= 599))
  );
}

export async function bootstrapGuestAuthTransport(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
): Promise<GuestAuthBootstrapResult> {
  if (fragmentToken === null) {
    return { token: null, client: GuestApiClient.browserSession() };
  }

  if (!enrollmentEnabled) {
    return { token: fragmentToken, client: new GuestApiClient(fragmentToken) };
  }

  const bootstrapClient = new GuestApiClient(fragmentToken);
  await bootstrapClient.enrollBrowserSession();
  try {
    await bootstrapClient.exchangeBrowserSession();
  } catch (error) {
    if (!isAmbiguousExchangeFailure(error)) throw error;
    await bootstrapClient.exchangeBrowserSession();
  }

  return { token: null, client: GuestApiClient.browserSession() };
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
    client:
      initialToken === undefined || initialToken === null
        ? null
        : new GuestApiClient(initialToken),
    isComplete: initialToken !== undefined,
  }));

  useEffect(() => {
    if (initialToken !== undefined) return;

    let isActive = true;
    queueMicrotask(async () => {
      if (!isActive) return;
      const fragmentToken = extractGuestFragmentToken();
      const enrollmentEnabled =
        process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === 'true';
      try {
        const result = await bootstrapGuestAuthTransport(
          fragmentToken,
          enrollmentEnabled,
        );
        if (!isActive) return;
        setBootstrap({ ...result, isComplete: true });
      } catch {
        if (!isActive) return;
        setBootstrap({ token: fragmentToken, client: null, isComplete: true });
      }
    });

    return () => {
      isActive = false;
    };
  }, [initialToken]);

  const setToken = useCallback((token: string | null) => {
    setBootstrap({
      token,
      client: token === null ? null : new GuestApiClient(token),
      isComplete: true,
    });
  }, []);

  const {
    token,
    client,
    isComplete: isTokenBootstrapComplete,
  } = bootstrap;

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
