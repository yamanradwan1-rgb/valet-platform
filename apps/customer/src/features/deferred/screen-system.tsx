import React from 'react';

import { formatSessionState } from '../../i18n/format-session-state';
import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { IcAlert, IcClock, IcWifiOff } from '../../components/icons/status-icons';
import { IcRefresh } from '../../components/icons/action-icons';
import { C } from '../../lib/theme/colors';

export function ScreenNetworkUnavailable({
  onRetry,
  lastKnownState,
}: {
  readonly onRetry: () => void;
  readonly lastKnownState?: string | undefined;
}) {
  const { t } = useTranslation();
  const formattedState = lastKnownState ? formatSessionState(lastKnownState, t) : undefined;

  return (
    <div
      className="screen-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 32,
        paddingRight: 32,
        minHeight: '70vh',
        gap: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: C.ice,
          color: C.muted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: 'scale(1.2)', display: 'flex' }}>
          <IcWifiOff />
        </div>
      </div>
      <div>
        <p
          className="font-display"
          style={{ fontSize: 20, fontWeight: 600, color: C.navy, margin: 0 }}
        >
          {t('system.networkUnavailableTitle')}
        </p>
        <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0, color: C.grey, maxWidth: 280 }}>
          {t('system.networkUnavailableSub')}
        </p>
      </div>

      {formattedState && (
        <div
          style={{
            borderRadius: 14,
            padding: '16px 20px',
            width: '100%',
            border: `1px solid ${C.border}`,
            textAlign: 'start',
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, margin: 0 }}>
            {t('system.lastRecordedState', { state: formattedState })}
          </p>
        </div>
      )}

      <Btn onClick={onRetry} variant="secondary" fullWidth={false}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IcRefresh /> {t('common.tryAgain')}
        </span>
      </Btn>
    </div>
  );
}

export function ScreenExpired() {
  const { t } = useTranslation();

  return (
    <div
      className="screen-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 32,
        paddingRight: 32,
        minHeight: '70vh',
        gap: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: C.ice,
          color: C.muted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: 'scale(1.2)', display: 'flex' }}>
          <IcClock />
        </div>
      </div>
      <div>
        <p
          className="font-display"
          style={{ fontSize: 20, fontWeight: 600, color: C.navy, margin: 0 }}
        >
          {t('system.expiredTitle')}
        </p>
        <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0, color: C.grey, maxWidth: 280 }}>
          {t('system.expiredSub')}
        </p>
      </div>
    </div>
  );
}

export function ScreenRequestError({
  message,
  onRetry,
}: {
  readonly message?: string | undefined;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="screen-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 32,
        paddingRight: 32,
        minHeight: '60vh',
        gap: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: `${C.danger}12`,
          color: C.danger,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: 'scale(1.2)', display: 'flex' }}>
          <IcAlert />
        </div>
      </div>
      <div>
        <p
          className="font-display"
          style={{ fontSize: 20, fontWeight: 600, color: C.navy, margin: 0 }}
        >
          {t('system.requestErrorTitle')}
        </p>
        <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0, color: C.grey }}>
          {message ?? t('system.requestErrorDefault')}
        </p>
      </div>
      <div style={{ width: '100%' }}>
        <Btn onClick={onRetry}>{t('common.tryAgain')}</Btn>
      </div>
    </div>
  );
}
