import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { IcCheck } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenCompleted({
  session,
  onViewReceipt,
  onRateExperience,
}: {
  readonly session: GuestSafeSession;
  readonly onViewReceipt?: (() => void) | undefined;
  readonly onRateExperience?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const vehicleName = `${session.vehicle.make ?? t('vehicle.defaultMake')} ${session.vehicle.model ?? ''}`.trim();
  const isDev = process.env.NODE_ENV !== 'production';

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
      <StatusBadge status="success" label={t('completed.badge')} />

      <div>
        <SectionTitle>{t('completed.title', { vehicle: vehicleName })}</SectionTitle>
        <p style={{ fontSize: 14, color: C.textSecondary, marginTop: 4, marginBottom: 0 }}>
          {t('completed.subtitle')}
        </p>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
          backgroundColor: C.iceSemantic,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            backgroundColor: 'rgba(47, 155, 120, 0.15)',
            color: C.successSemantic,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
          }}
        >
          <IcCheck />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
          {t('completed.cardTitle')}
        </p>
        <p style={{ fontSize: 13, color: C.textSecondary, marginTop: 4, marginBottom: 0 }}>
          {t('completed.cardSub')}
        </p>
      </div>

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      {isDev && (onViewReceipt || onRateExperience) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderTop: `1px dashed ${C.borderSemantic}`,
            paddingTop: 16,
          }}
        >
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textSecondary }}>
            {t('completed.devPreviews')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {onViewReceipt && (
              <button
                type="button"
                onClick={onViewReceipt}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.borderSemantic}`,
                  backgroundColor: C.surface,
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {t('completed.receiptPreview')}
              </button>
            )}
            {onRateExperience && (
              <button
                type="button"
                onClick={onRateExperience}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.borderSemantic}`,
                  backgroundColor: C.surface,
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {t('completed.ratingPreview')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
