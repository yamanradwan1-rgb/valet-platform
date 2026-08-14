'use client';

import { useCallback, useRef, useState } from 'react';

import { GuestApiError } from '../../lib/api/api-error';
import { useGuestAuth } from '../auth/guest-auth-context';
import { useGuestSession } from '../session/use-guest-session';

export function useRetrieval() {
  const { client } = useGuestAuth();
  const { session, updateSession, refreshSession } = useGuestSession();

  const isRequestingRef = useRef<boolean>(false);
  const isCancellingRef = useRef<boolean>(false);

  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestVehicle = useCallback(async (): Promise<boolean> => {
    // Synchronous ref lock ensures concurrent invocations immediately abort
    if (!client || isRequestingRef.current) return false;

    isRequestingRef.current = true;
    setIsRequesting(true);
    setActionError(null);

    try {
      const updated = await client.requestRetrieval();
      updateSession(updated);
      return true;
    } catch (err: unknown) {
      if (err instanceof GuestApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to request vehicle. Please try again.');
      }
      await refreshSession();
      return false;
    } finally {
      isRequestingRef.current = false;
      setIsRequesting(false);
    }
  }, [client, updateSession, refreshSession]);

  const cancelRetrieval = useCallback(async (): Promise<boolean> => {
    // Synchronous ref lock ensures concurrent invocations immediately abort
    if (!client || isCancellingRef.current) return false;

    isCancellingRef.current = true;
    setIsCancelling(true);
    setActionError(null);

    try {
      const updated = await client.cancelRetrieval();
      updateSession(updated);
      return true;
    } catch (err: unknown) {
      if (err instanceof GuestApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to cancel retrieval. Please check current status.');
      }
      await refreshSession();
      return false;
    } finally {
      isCancellingRef.current = false;
      setIsCancelling(false);
    }
  }, [client, updateSession, refreshSession]);

  return {
    isRequesting,
    isCancelling,
    actionError,
    requestVehicle,
    cancelRetrieval,
    clearError: () => setActionError(null),
    canCancel: session?.state === 'REQUESTED',
  };
}
