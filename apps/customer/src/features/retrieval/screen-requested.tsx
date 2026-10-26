import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { StatusBadge } from '../../components/primitives/status-badge';
import { VehicleHero } from '../../components/primitives/vehicle-hero';
import { IcClock } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenRequested({
  session,
  onCancel,
  isCancelling = false,
  canCancel = true,
  error,
}: {
  readonly session: GuestSafeSession;
  readonly onCancel: () => void;
  readonly isCancelling?: boolean;
  readonly canCancel?: boolean;
  readonly error?: string | null;
}) {
  const { t } = useTranslation();

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
      <StatusBadge status="active" label={t('requested.badge')} />

      <VehicleHero
        make={session.vehicle.make}
        model={session.vehicle.model}
        color={session.vehicle.color}
      />

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.accentSurface,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, color: C.text, margin: 0 }}>
          {t('requested.cardTitle')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ color: C.accent, display: 'flex' }}>
            <IcClock />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.accent }}>
            {t('requested.cardSub')}
          </span>
        </div>
      </div>

      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <JourneyProgress step={0} />
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: C.dangerSurface,
            color: C.dangerSemantic,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isCancelling || !canCancel}
          style={{
            width: '100%',
            textAlign: 'center',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: isCancelling || !canCancel ? C.textMuted : C.textSecondary,
            background: 'none',
            border: `1px solid ${C.borderSemantic}`,
            borderRadius: 10,
            cursor: isCancelling || !canCancel ? 'not-allowed' : 'pointer',
            transition: 'opacity 150ms ease',
          }}
        >
          {isCancelling ? t('requested.cancelling') : t('requested.cancelButton')}
        </button>
      </div>
    </div>
  );
}
