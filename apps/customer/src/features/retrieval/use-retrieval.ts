'use client';

import { useCallback, useState } from 'react';

import { GuestApiError } from '../../lib/api/api-error';
import { useGuestAuth } from '../auth/guest-auth-context';
import { useGuestSession } from '../session/use-guest-session';

export function useRetrieval() {
  const { client } = useGuestAuth();
  const { session, updateSession, refreshSession } = useGuestSession();

  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestVehicle = useCallback(async (): Promise<boolean> => {
    if (!client || isRequesting) return false;

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
      setIsRequesting(false);
    }
  }, [client, isRequesting, updateSession, refreshSession]);

  const cancelRetrieval = useCallback(async (): Promise<boolean> => {
    if (!client || isCancelling) return false;

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
      // If retrieval was already started, refresh authoritative state
      await refreshSession();
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, [client, isCancelling, updateSession, refreshSession]);

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
