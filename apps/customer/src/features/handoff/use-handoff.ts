'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { GuestApiError } from '../../lib/api/api-error';
import type {
  GuestHandoffMaterial,
  HandoffStandardMethod,
} from '../../lib/api/guest-api-types';
import { useGuestAuth } from '../auth/guest-auth-context';
import { useGuestSession } from '../session/use-guest-session';

export function useHandoff(preferredMethod: HandoffStandardMethod = 'PICKUP_CODE') {
  const { client } = useGuestAuth();
  const { session } = useGuestSession();

  const [activeMethod, setActiveMethod] = useState<HandoffStandardMethod>(preferredMethod);
  const [material, setMaterial] = useState<GuestHandoffMaterial | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | undefined>(undefined);

  const isPending = session?.state === 'HANDOFF_PENDING';
  const prevIsPendingRef = useRef<boolean>(false);

  const fetchMaterial = useCallback(
    async (method: HandoffStandardMethod, rotate = false) => {
      if (!client || !isPending) return;

      if (rotate) setIsRotating(true);
      else setIsLoading(true);
      setError(null);

      try {
        const result = rotate
          ? await client.rotateHandoff(method)
          : await client.issueHandoff(method);
        setMaterial(result);
        setActiveMethod(result.method);
      } catch (err: unknown) {
        if (err instanceof GuestApiError) {
          setError(err.message);
        } else {
          setError('Failed to issue verification proof. Please try again.');
        }
      } finally {
        if (rotate) setIsRotating(false);
        else setIsLoading(false);
      }
    },
    [client, isPending],
  );

  // Trigger initial fetch on transition into HANDOFF_PENDING
  useEffect(() => {
    if (isPending && !prevIsPendingRef.current) {
      prevIsPendingRef.current = true;
      void fetchMaterial(activeMethod, false);
    } else if (!isPending && prevIsPendingRef.current) {
      prevIsPendingRef.current = false;
    }
  }, [isPending, activeMethod, fetchMaterial]);

  // Expiration countdown
  useEffect(() => {
    if (!material?.expiresAt) return;

    const computeDiff = () => {
      const expiry = new Date(material.expiresAt).getTime();
      return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
    };

    const interval = setInterval(() => {
      setSecondsRemaining(computeDiff());
    }, 1000);

    return () => clearInterval(interval);
  }, [material?.expiresAt]);

  const switchMethod = useCallback(
    async (newMethod: HandoffStandardMethod) => {
      setActiveMethod(newMethod);
      await fetchMaterial(newMethod, true);
    },
    [fetchMaterial],
  );

  const rotateCurrent = useCallback(async () => {
    await fetchMaterial(activeMethod, true);
  }, [activeMethod, fetchMaterial]);

  return {
    activeMethod,
    material: isPending ? material : null,
    isLoading,
    isRotating,
    error,
    secondsRemaining: isPending ? secondsRemaining : undefined,
    isExpired: secondsRemaining !== undefined && secondsRemaining <= 0,
    switchMethod,
    rotateCurrent,
  };
}
