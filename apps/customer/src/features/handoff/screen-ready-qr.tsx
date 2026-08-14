import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';
import { DynamicQRCode } from './qr-code';

export function ScreenReadyQR({
  session,
  qrPayload,
  secondsRemaining,
  onSwitchToPIN,
  onRotate,
  isRotating,
  error,
}: {
  readonly session: GuestSafeSession;
  readonly qrPayload?: string | undefined;
  readonly secondsRemaining?: number | undefined;
  readonly onSwitchToPIN?: (() => void) | undefined;
  readonly onRotate?: (() => void) | undefined;
  readonly isRotating?: boolean | undefined;
  readonly error?: string | null | undefined;
}) {
  const { t } = useTranslation();
  const vehicleName = `${session.vehicle.make ?? t('vehicle.defaultMake')} ${session.vehicle.model ?? ''}`.trim();

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <StatusBadge status="success" label={t('handoffQr.badge')} />

      <div>
        <SectionTitle>{t('handoffQr.title', { vehicle: vehicleName })}</SectionTitle>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
          backgroundColor: C.ice,
        }}
      >
        <p style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.grey, margin: 0 }}>
          {t('handoffQr.instruction')}
        </p>

        <div
          style={{
            marginTop: 16,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {qrPayload ? (
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
                padding: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <DynamicQRCode payload={qrPayload} size={180} />
            </div>
          ) : (
            <div
              style={{
                width: 204,
                height: 204,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                color: C.grey,
                fontSize: 13,
              }}
            >
              {t('common.loadingQr')}
            </div>
          )}
        </div>

        {typeof secondsRemaining === 'number' && (
          <p style={{ fontSize: 12, color: secondsRemaining < 30 ? C.danger : C.grey, margin: 0 }}>
            {t('handoffQr.updatesEvery', { seconds: secondsRemaining })}
          </p>
        )}

        {error && (
          <p style={{ fontSize: 12, color: C.danger, marginTop: 8, marginBottom: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          {onRotate && (
            <button
              type="button"
              onClick={onRotate}
              disabled={isRotating}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: C.blue,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              {isRotating ? t('handoffQr.refreshing') : t('handoffQr.refreshButton')}
            </button>
          )}

          {onSwitchToPIN && (
            <button
              type="button"
              onClick={onSwitchToPIN}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: C.navy,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                textDecoration: 'underline',
              }}
            >
              {t('handoffQr.switchToPin')}
            </button>
          )}
        </div>
      </div>

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      <TrustStrip />
    </div>
  );
}
