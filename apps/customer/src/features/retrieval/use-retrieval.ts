'use client';

import { useCallback, useRef, useState } from 'react';

import { GuestApiError } from '../../lib/api/api-error';
import { createInFlightLock, type InFlightLock } from '../../lib/async/in-flight-guard';
import { useGuestAuth } from '../auth/guest-auth-context';
import { useGuestSession } from '../session/use-guest-session';

export function useRetrieval() {
  const { client } = useGuestAuth();
  const { session, updateSession, refreshSession } = useGuestSession();

  const requestLockRef = useRef<InFlightLock | null>(null);
  const cancelLockRef = useRef<InFlightLock | null>(null);

  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const getRequestLock = useCallback((): InFlightLock => {
    if (!requestLockRef.current) {
      requestLockRef.current = createInFlightLock();
    }
    return requestLockRef.current;
  }, []);

  const getCancelLock = useCallback((): InFlightLock => {
    if (!cancelLockRef.current) {
      cancelLockRef.current = createInFlightLock();
    }
    return cancelLockRef.current;
  }, []);

  const requestVehicle = useCallback(async (): Promise<boolean> => {
    if (!client) return false;
    const lock = getRequestLock();

    const result = await lock.runGuarded(async () => {
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
    });

    return result ?? false;
  }, [client, getRequestLock, updateSession, refreshSession]);

  const cancelRetrieval = useCallback(async (): Promise<boolean> => {
    if (!client) return false;
    const lock = getCancelLock();

    const result = await lock.runGuarded(async () => {
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
        setIsCancelling(false);
      }
    });

    return result ?? false;
  }, [client, getCancelLock, updateSession, refreshSession]);

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
