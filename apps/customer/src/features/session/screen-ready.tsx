import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenReady({
  session,
}: {
  readonly session: GuestSafeSession;
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
      <StatusBadge status="success" label={t('ready.badge')} />

      <div>
        <SectionTitle>{t('ready.title', { vehicle: vehicleName })}</SectionTitle>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, color: C.navy, margin: 0 }}>
          {t('ready.cardTitle')}
        </p>
        <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0, color: C.grey }}>
          {t('ready.cardSub')}
        </p>
      </div>

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      <TrustStrip />
    </div>
  );
}
