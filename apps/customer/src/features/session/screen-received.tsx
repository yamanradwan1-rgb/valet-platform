import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { StatusBadge } from '../../components/primitives/status-badge';
import { VehicleHero } from '../../components/primitives/vehicle-hero';
import { Btn } from '../../components/primitives/btn';
import { IcClock } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenReceived({
  session,
  onRefresh,
  isRefreshing = false,
}: {
  readonly session: GuestSafeSession;
  readonly onRefresh: () => void;
  readonly isRefreshing?: boolean;
}) {
  const { t } = useTranslation();

  const statusLabel =
    session.state === 'PARKING'
      ? t('received.statusParking')
      : session.state === 'AWAITING_PARKING'
        ? t('received.statusAwaiting')
        : t('received.statusReceived');

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <StatusBadge status="info" label={statusLabel} />

      <VehicleHero
        make={session.vehicle.make}
        model={session.vehicle.model}
        color={session.vehicle.color}
        dim
      />

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.iceSemantic,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ color: C.accent, display: 'flex', marginTop: 2 }}>
            <IcClock />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: C.text, margin: 0 }}>
              {t('received.cardTitle')}
            </p>
            <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0, color: C.textSecondary }}>
              {t('received.cardSub')}
            </p>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        <Btn onClick={onRefresh} variant="secondary" loading={isRefreshing}>
          {t('common.refresh')}
        </Btn>
      </div>
    </div>
  );
}
