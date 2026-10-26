import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { VehicleHero } from '../../components/primitives/vehicle-hero';
import { IcClock } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenOnTheWay({
  session,
}: {
  readonly session: GuestSafeSession;
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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          className="pulse-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: C.accent,
            display: 'block',
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 500, color: C.accent }}>
          {t('onTheWay.badge')}
        </span>
      </div>

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
          {t('onTheWay.cardTitle')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ color: C.accent, display: 'flex' }}>
            <IcClock />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.accent }}>
            {t('onTheWay.cardSub')}
          </span>
        </div>
      </div>

      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <JourneyProgress step={1} />
      </div>

      <TrustStrip />
    </div>
  );
}
