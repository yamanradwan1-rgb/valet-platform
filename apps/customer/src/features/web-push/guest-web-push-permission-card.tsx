'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { useTranslation } from '../../i18n/use-translation';
import {
  GUEST_CONTEXT_CHANGED_EVENT,
  readBrowserContextMarker,
} from '../../lib/api/guest-browser-context-marker';
import { C } from '../../lib/theme/colors';
import { guestWebPushCopy } from './guest-web-push-copy';
import {
  detectGuestWebPushCapability,
  enableGuestWebPush,
  readGuestWebPushCapability,
  type GuestWebPushCapability,
  type GuestWebPushTransport,
} from './guest-web-push-client';
import { createGuestWebPushTransport } from './guest-web-push-transport';

type PresentationState = GuestWebPushCapability | 'CHECKING' | 'ENABLING' | 'FAILED';
const CONFIG_CHECK_DEADLINE_MS = 12_000;
const ENABLE_DEADLINE_MS = 35_000;

export function GuestWebPushPermissionPresentation({
  copy,
  direction,
  state,
  onDismiss,
  onEnable,
}: {
  readonly copy: ReturnType<typeof guestWebPushCopy>;
  readonly direction: 'ltr' | 'rtl';
  readonly state: Exclude<PresentationState, 'CHECKING'>;
  readonly onDismiss: () => void;
  readonly onEnable: () => void;
}) {
  const canEnable = state === 'AVAILABLE' || state === 'FAILED';
  const unavailable = state === 'DENIED' || state === 'UNSUPPORTED' ||
    state === 'IOS_HOME_SCREEN_REQUIRED' || state === 'FAILED';
  const body = state === 'IOS_HOME_SCREEN_REQUIRED'
    ? copy.iosHomeScreenRequired
    : unavailable ? copy.unavailable : copy.permissionBody;
  return (
    <section
      aria-live="polite"
      dir={direction}
      style={{
        backgroundColor: C.surfaceRaised,
        border: `1px solid ${C.borderSemantic}`,
        borderRadius: 16,
        bottom: 88,
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.18)',
        left: '50%',
        maxWidth: 390,
        padding: 16,
        position: 'fixed',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        zIndex: 90,
      }}
    >
      <strong style={{ color: C.text, display: 'block', fontSize: 15 }}>
        {copy.permissionTitle}
      </strong>
      <p style={{ color: C.textSecondary, fontSize: 13, lineHeight: 1.5, margin: '6px 0 14px' }}>
        {body}
      </p>
      {canEnable || state === 'ENABLING' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn fullWidth loading={state === 'ENABLING'} onClick={onEnable} small>
            {copy.enable}
          </Btn>
          <Btn fullWidth onClick={onDismiss} small variant="secondary">
            {copy.notNow}
          </Btn>
        </div>
      ) : (
        <Btn fullWidth onClick={onDismiss} small variant="secondary">
          {copy.notNow}
        </Btn>
      )}
    </section>
  );
}

export function GuestWebPushPermissionCard({
  transport,
}: {
  readonly transport?: GuestWebPushTransport;
}) {
  const { direction, locale } = useTranslation();
  const copy = guestWebPushCopy(locale);
  const [activeTransport] = useState(() => transport ?? createGuestWebPushTransport());
  const [dismissed, updateDismissed] = useState(false);
  const mountedRef = useRef(false);
  const dismissedRef = useRef(false);
  const generationRef = useRef(0);
  const operationRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<PresentationState>(() => {
    if (typeof window === 'undefined') return 'UNSUPPORTED';
    const capability = detectGuestWebPushCapability(readGuestWebPushCapability());
    return capability === 'AVAILABLE' ? 'CHECKING' : capability;
  });

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    operationRef.current?.abort();
    operationRef.current = null;
  }, []);

  // The existing Not now JSX calls this synchronously, including while enabling.
  const setDismissed = useCallback((value: boolean) => {
    if (value) {
      dismissedRef.current = true;
      invalidate();
    }
    updateDismissed(value);
  }, [invalidate]);

  const canCommit = useCallback((
    controller: AbortController,
    generation: number,
    marker: string | null,
  ) => {
    if (!mountedRef.current || dismissedRef.current || controller.signal.aborted ||
      operationRef.current !== controller || generationRef.current !== generation) return false;
    if (readBrowserContextMarker() !== marker) {
      setDismissed(true);
      return false;
    }
    return true;
  }, [setDismissed]);

  useEffect(() => {
    mountedRef.current = true;
    const onContextChange = () => setDismissed(true);
    window.addEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(GUEST_CONTEXT_CHANGED_EVENT, onContextChange);
      invalidate();
    };
  }, [invalidate, setDismissed]);

  useEffect(() => {
    if (state !== 'CHECKING' || dismissedRef.current) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const marker = readBrowserContextMarker();
    operationRef.current = controller;
    const deadline = setTimeout(() => {
      if (!canCommit(controller, generation, marker)) return;
      invalidate();
      setState('FAILED');
    }, CONFIG_CHECK_DEADLINE_MS);
    void activeTransport.loadVapidPublicKey(controller.signal).then(
      () => { if (canCommit(controller, generation, marker)) setState('AVAILABLE'); },
      () => { if (canCommit(controller, generation, marker)) setState('FAILED'); },
    ).finally(() => clearTimeout(deadline));
    return () => {
      clearTimeout(deadline);
      controller.abort();
      if (operationRef.current === controller) operationRef.current = null;
    };
  }, [activeTransport, canCommit, invalidate, state]);

  if (dismissed || state === 'CHECKING') return null;
  const onEnable = async () => {
    if ((state !== 'AVAILABLE' && state !== 'FAILED') ||
      !mountedRef.current || dismissedRef.current || operationRef.current !== null) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const marker = readBrowserContextMarker();
    operationRef.current = controller;
    setState('ENABLING');
    const deadline = setTimeout(() => {
      if (!canCommit(controller, generation, marker)) return;
      invalidate();
      setState('FAILED');
    }, ENABLE_DEADLINE_MS);
    try {
      const result = await enableGuestWebPush(activeTransport, locale, controller.signal);
      if (!canCommit(controller, generation, marker)) return;
      if (result === 'ENABLED') {
        setDismissed(true);
        return;
      }
      setState(result);
    } catch {
      if (canCommit(controller, generation, marker)) setState('FAILED');
    } finally {
      clearTimeout(deadline);
      if (operationRef.current === controller) operationRef.current = null;
    }
  };

  return <GuestWebPushPermissionPresentation
    copy={copy}
    direction={direction}
    state={state}
    onDismiss={() => setDismissed(true)}
    onEnable={() => void onEnable()}
  />;
}
