'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { GuestApiError } from '../../lib/api/api-error';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { useGuestAuth } from '../auth/guest-auth-context';
import { GuestSessionContext } from './use-guest-session';

const POLLING_INTERVAL_MS = 5_000;

export function GuestSessionProvider({
  children,
  initialSession,
}: {
  readonly children: React.ReactNode;
  readonly initialSession?: GuestSafeSession | null | undefined;
}) {
  const { client } = useGuestAuth();
  const [session, setSession] = useState<GuestSafeSession | null>(initialSession ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialSession && Boolean(client));
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState<boolean>(false);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const inFlightRef = useRef<boolean>(false);
  const sessionStateRef = useRef<string | undefined>(session?.state);

  useEffect(() => {
    sessionStateRef.current = session?.state;
  }, [session?.state]);

  const fetchSession = useCallback(async () => {
    if (!client || inFlightRef.current) return;
    if (sessionStateRef.current === 'COMPLETED') return;

    inFlightRef.current = true;

    try {
      const data = await client.loadSession();
      setSession(data);
      setError(null);
      setIsNetworkError(false);
      setIsExpired(false);
    } catch (err: unknown) {
      if (err instanceof GuestApiError) {
        if (err.isNetworkError) {
          setIsNetworkError(true);
        } else if (err.code === 'GUEST_ACCESS_INVALID') {
          setIsExpired(true);
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to load vehicle status.');
      }
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [client]);

  const refreshSession = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  const updateSession = useCallback((newSession: GuestSafeSession) => {
    setSession(newSession);
    setError(null);
    setIsNetworkError(false);
  }, []);

  // Initial load via asynchronous trigger
  useEffect(() => {
    if (client && !session) {
      const timer = setTimeout(() => {
        void fetchSession();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [client, session, fetchSession]);

  // Foreground Polling
  useEffect(() => {
    if (!client || isExpired) return;

    const intervalId = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        sessionStateRef.current !== 'COMPLETED'
      ) {
        void fetchSession();
      }
    }, POLLING_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        sessionStateRef.current !== 'COMPLETED'
      ) {
        void fetchSession();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [client, isExpired, fetchSession]);

  const value = {
    session,
    isLoading,
    error,
    isNetworkError,
    isExpired,
    refreshSession,
    updateSession,
  };

  return (
    <GuestSessionContext.Provider value={value}>
      {children}
    </GuestSessionContext.Provider>
  );
}
