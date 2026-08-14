import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { PickupPIN } from '../../components/primitives/pickup-pin';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenReadyPIN({
  session,
  pickupCode,
  secondsRemaining,
  onSwitchToQR,
  onRotate,
  isRotating,
  error,
}: {
  readonly session: GuestSafeSession;
  readonly pickupCode?: string | undefined;
  readonly secondsRemaining?: number | undefined;
  readonly onSwitchToQR?: (() => void) | undefined;
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
      <StatusBadge status="success" label={t('handoffPin.badge')} />

      <div>
        <SectionTitle>{t('handoffPin.title', { vehicle: vehicleName })}</SectionTitle>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
          backgroundColor: C.iceSemantic,
        }}
      >
        <p style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textSecondary, margin: 0 }}>
          {t('handoffPin.instruction')}
        </p>

        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <PickupPIN
            code={pickupCode ?? '----'}
            expiresInSeconds={secondsRemaining}
            onRotate={onRotate}
            isRotating={isRotating}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: C.dangerSemantic, marginTop: 8, marginBottom: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          {onSwitchToQR && (
            <button
              type="button"
              onClick={onSwitchToQR}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: C.text,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                textDecoration: 'underline',
              }}
            >
              {t('handoffPin.switchToQr')}
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
