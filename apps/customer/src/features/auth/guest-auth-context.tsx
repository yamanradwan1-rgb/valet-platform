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
  readonly isBootstrapTemporarilyUnavailable: boolean;
  readonly retryBootstrap: () => Promise<void>;
  readonly setToken: (token: string | null) => void;
}

const GuestAuthContext = createContext<GuestAuthContextValue | null>(null);

interface GuestTokenBootstrapState {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly isComplete: boolean;
  readonly isTemporarilyUnavailable: boolean;
  readonly retryStage: GuestAuthBootstrapStage | null;
}

interface GuestAuthBootstrapResult {
  readonly token: string | null;
  readonly client: GuestApiClient;
}

type GuestAuthBootstrapStage = 'ENROLL' | 'EXCHANGE';

export function isRetryableGuestAuthBootstrapFailure(error: unknown): boolean {
  return (
    error instanceof GuestApiError &&
    (error.isNetworkError ||
      (error.status >= 500 && error.status <= 599))
  );
}

function isTerminalGuestAuthBootstrapFailure(error: unknown): boolean {
  return error instanceof GuestApiError && error.code === 'GUEST_ACCESS_INVALID';
}

function isAmbiguousExchangeFailure(error: unknown): boolean {
  return (
    error instanceof GuestApiError &&
    (error.isNetworkError || (error.status >= 500 && error.status <= 599))
  );
}

async function exchangeBrowserSessionWithRecovery(
  bootstrapClient: GuestApiClient,
): Promise<void> {
  try {
    await bootstrapClient.exchangeBrowserSession();
  } catch (error) {
    if (!isAmbiguousExchangeFailure(error)) throw error;
    await bootstrapClient.exchangeBrowserSession();
  }
}

async function runGuestAuthBootstrap(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  onStage?: (stage: GuestAuthBootstrapStage) => void,
): Promise<GuestAuthBootstrapResult> {
  if (fragmentToken === null) {
    return { token: null, client: GuestApiClient.browserSession() };
  }

  if (!enrollmentEnabled) {
    return { token: fragmentToken, client: new GuestApiClient(fragmentToken) };
  }

  const bootstrapClient = new GuestApiClient(fragmentToken);
  onStage?.('ENROLL');
  await bootstrapClient.enrollBrowserSession();
  onStage?.('EXCHANGE');
  await exchangeBrowserSessionWithRecovery(bootstrapClient);

  return { token: null, client: GuestApiClient.browserSession() };
}

export async function bootstrapGuestAuthTransport(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
): Promise<GuestAuthBootstrapResult> {
  return runGuestAuthBootstrap(fragmentToken, enrollmentEnabled);
}

export async function retryGuestAuthBootstrapTransport(
  fragmentToken: string,
  enrollmentEnabled: boolean,
  retryStage: GuestAuthBootstrapStage,
  onStage?: (stage: GuestAuthBootstrapStage) => void,
): Promise<GuestAuthBootstrapResult> {
  if (enrollmentEnabled && retryStage === 'EXCHANGE') {
    const bootstrapClient = new GuestApiClient(fragmentToken);
    await exchangeBrowserSessionWithRecovery(bootstrapClient);
    return { token: null, client: GuestApiClient.browserSession() };
  }
  return runGuestAuthBootstrap(fragmentToken, enrollmentEnabled, onStage);
}

function failedBootstrapState(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  error: unknown,
  retryStage: GuestAuthBootstrapStage,
): GuestTokenBootstrapState {
  if (
    enrollmentEnabled &&
    fragmentToken !== null &&
    !isTerminalGuestAuthBootstrapFailure(error)
  ) {
    const retryable = isRetryableGuestAuthBootstrapFailure(error);
    return {
      token: fragmentToken,
      client: null,
      isComplete: true,
      isTemporarilyUnavailable: retryable,
      retryStage: retryable ? retryStage : null,
    };
  }
  return {
    token: null,
    client: null,
    isComplete: true,
    isTemporarilyUnavailable: false,
    retryStage: null,
  };
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
      let retryStage: GuestAuthBootstrapStage = 'ENROLL';
      try {
        const result = await runGuestAuthBootstrap(
          fragmentToken,
          enrollmentEnabled,
          (stage) => {
            retryStage = stage;
          },
        );
        if (!isActive) return;
        setBootstrap({
          ...result,
          isComplete: true,
          isTemporarilyUnavailable: false,
          retryStage: null,
        });
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

  const retryBootstrap = useCallback(async () => {
    if (
      !bootstrap.isTemporarilyUnavailable ||
      bootstrap.token === null ||
      bootstrap.retryStage === null
    ) {
      return;
    }

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
      setBootstrap({
        ...result,
        isComplete: true,
        isTemporarilyUnavailable: false,
        retryStage: null,
      });
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

  const setToken = useCallback((token: string | null) => {
    setBootstrap({
      token,
      client: token === null ? null : new GuestApiClient(token),
      isComplete: true,
      isTemporarilyUnavailable: false,
      retryStage: null,
    });
  }, []);

  const {
    token,
    client,
    isComplete: isTokenBootstrapComplete,
    isTemporarilyUnavailable: isBootstrapTemporarilyUnavailable,
  } = bootstrap;

  const value = useMemo(
    () => ({
      token,
      client,
      isTokenBootstrapComplete,
      isBootstrapTemporarilyUnavailable,
      retryBootstrap,
      setToken,
    }),
    [
      token,
      client,
      isTokenBootstrapComplete,
      isBootstrapTemporarilyUnavailable,
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
