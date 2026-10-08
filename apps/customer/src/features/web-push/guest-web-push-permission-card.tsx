'use client';

import React, { useEffect, useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { useTranslation } from '../../i18n/use-translation';
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
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<PresentationState>(() => {
    if (typeof window === 'undefined') return 'UNSUPPORTED';
    const capability = detectGuestWebPushCapability(readGuestWebPushCapability());
    return capability === 'AVAILABLE' ? 'CHECKING' : capability;
  });

  useEffect(() => {
    if (state !== 'CHECKING') return;
    let current = true;
    void activeTransport.loadVapidPublicKey().then(
      () => { if (current) setState('AVAILABLE'); },
      () => { if (current) setState('FAILED'); },
    );
    return () => { current = false; };
  }, [activeTransport, state]);

  if (dismissed || state === 'CHECKING') return null;
  const onEnable = async () => {
    if (state !== 'AVAILABLE' && state !== 'FAILED') return;
    setState('ENABLING');
    try {
      const result = await enableGuestWebPush(activeTransport, locale);
      if (result === 'ENABLED') {
        setDismissed(true);
        return;
      }
      setState(result);
    } catch {
      setState('FAILED');
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
