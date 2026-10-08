'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLocalizedErrorMessage } from '../../i18n/error-translator';
import { useTranslation } from '../../i18n/use-translation';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { useGuestAuth } from '../auth/guest-auth-context';
import { attemptGuestReadyAlertAudio } from '../ready-alert/guest-ready-alert-audio';
import {
  createGuestReadyAlertTracker, observeGuestReadySnapshot,
} from '../ready-alert/guest-ready-alert-tracker';
import { GuestVehicleReadyAlert } from '../ready-alert/guest-vehicle-ready-alert';
import { classifyGuestReadFailure } from './guest-read-error-classification';
import {
  GUEST_FOREGROUND_STALE_TARGET_MS, nextGuestReadDelay,
} from './guest-read-schedule';
import { GuestRequestCoordinator, type GuestCoordinatorState } from './guest-request-coordinator';
import { GuestSessionContext } from './use-guest-session';

export function GuestSessionProvider({
  children, initialSession,
}: {
  readonly children: React.ReactNode;
  readonly initialSession?: GuestSafeSession | null;
}) {
  const { t } = useTranslation();
  const { client, isContextSwitchOutcomeAmbiguous } = useGuestAuth();
  const initialClientRef = useRef(client);
  const [owner, setOwner] = useState<{
    readonly client: typeof client; readonly coordinator: GuestRequestCoordinator;
  } | null>(null);
  const [stateEnvelope, setStateEnvelope] = useState<{
    readonly client: typeof client; readonly state: GuestCoordinatorState;
  } | null>(null);
  const [readyAlert, setReadyAlert] = useState<{
    readonly client: typeof client; readonly identity: string | null;
  }>({ client, identity: null });
  const [isDocumentVisible, setDocumentVisible] = useState(true);
  const [isOnline, setOnline] = useState(true);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const coordinator = owner?.client === client ? owner.coordinator : null;
  const state = stateEnvelope?.client === client
    ? stateEnvelope.state : coordinator?.snapshot ?? null;
  const session = state?.session ?? null;
  const isFresh = Boolean(coordinator?.isTrusted &&
    isDocumentVisible && isOnline && !isContextSwitchOutcomeAmbiguous);
  const isStale = Boolean(session && !isFresh);
  const errorValue = state?.error;
  const error = errorValue ? getLocalizedErrorMessage(errorValue, t) : null;
  const isExpired = Boolean(state?.isExpired && !isContextSwitchOutcomeAmbiguous);
  const isNetworkError = Boolean(errorValue && !isExpired);
  const failureKind = classifyGuestReadFailure(errorValue);
  const isLoading = Boolean(client && !session && !error && !isExpired);
  const cooldownSeconds = Math.max(0, Math.ceil(((state?.cooldownUntil ?? 0) - clockNow) / 1_000));

  // Only this effect constructs and disposes client ownership. Old callbacks
  // become inert before the replacement coordinator is exposed to rendering.
  useEffect(() => {
    if (!client) return;
    let active = true;
    // Do not adopt an initial snapshot from a previous visit after a T1 switch.
    const trustedInitial = initialClientRef.current === client ? initialSession ?? null : null;
    const tracked = createGuestReadyAlertTracker(trustedInitial);
    const next = new GuestRequestCoordinator(
      client,
      (snapshot) => {
        if (active) setStateEnvelope({ client, state: snapshot });
      },
      (snapshot) => {
        if (!active) return;
        const decision = observeGuestReadySnapshot(tracked, snapshot);
        if (snapshot.state === 'COMPLETED' || decision.kind === 'BASELINE') {
          setReadyAlert({ client, identity: null });
        } else if (decision.kind === 'PRESENT') {
          attemptGuestReadyAlertAudio();
          setReadyAlert({ client, identity: decision.identity });
        }
      },
      trustedInitial,
    );
    queueMicrotask(() => {
      if (!active) return;
      setOwner({ client, coordinator: next });
      setReadyAlert({ client, identity: null });
      setClockNow(Date.now());
      setDocumentVisible(document.visibilityState !== 'hidden');
      setOnline(navigator.onLine !== false);
      void next.read();
    });
    return () => {
      active = false;
      next.dispose();
    };
  }, [client, initialSession]);

  useEffect(() => {
    if (!coordinator || isExpired) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const visible = () => document.visibilityState !== 'hidden';
    const online = () => navigator.onLine !== false;
    const pulse = () => setClockNow(Date.now());
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!active || !visible() || !online() || coordinator.snapshot.isExpired ||
          coordinator.snapshot.session?.state === 'COMPLETED') return;
      const delay = nextGuestReadDelay(coordinator.snapshot, Date.now());
      timer = setTimeout(() => {
        if (active && visible() && online()) void coordinator.read().finally(schedule);
      }, delay);
    };
    const recover = () => {
      setDocumentVisible(visible());
      setOnline(online());
      pulse();
      if (visible() && online()) void coordinator.triggerRead().finally(schedule);
      else schedule();
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('online', recover);
    window.addEventListener('offline', recover);
    window.addEventListener('pageshow', recover);
    window.addEventListener('focus', recover);
    const freshnessTimer = setInterval(pulse, 1000);
    schedule();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      clearInterval(freshnessTimer);
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('online', recover);
      window.removeEventListener('offline', recover);
      window.removeEventListener('pageshow', recover);
      window.removeEventListener('focus', recover);
    };
  }, [coordinator, isExpired]);

  // Manual refresh shares the same 2-second trigger coalescing policy as wake
  // events. A fast completed GET must not let rapid taps exhaust the legacy
  // COMPATIBILITY credential budget.
  const refreshSession = useCallback(async () => { await coordinator?.triggerRead(); }, [coordinator]);
  const beginMutation = useCallback(() => {
    if (!coordinator || !isDocumentVisible || !isOnline ||
        isContextSwitchOutcomeAmbiguous ||
        !coordinator.isFresh(GUEST_FOREGROUND_STALE_TARGET_MS)) return null;
    return coordinator.beginMutation();
  }, [coordinator, isDocumentVisible, isOnline, isContextSwitchOutcomeAmbiguous]);
  const updateSession = useCallback((snapshot: GuestSafeSession) => {
    coordinator?.updateSession(snapshot);
  }, [coordinator]);

  return (
    <>
      <GuestSessionContext.Provider value={{
        session, isLoading, error, isNetworkError, isExpired,
        failureKind,
        isRefreshing: Boolean(state?.isReading && session),
        isFresh, isStale, isMutating: Boolean(state?.isMutating),
        cooldownSeconds,
        refreshSession, updateSession, beginMutation,
      }}>
        {children}
      </GuestSessionContext.Provider>
      {readyAlert.client === client && readyAlert.identity !== null && isFresh && !isExpired && (
        <GuestVehicleReadyAlert onDismiss={() => setReadyAlert({ client, identity: null })} />
      )}
    </>
  );
}
