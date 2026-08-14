import React from 'react';

import { JourneyProgress } from '../../components/primitives/journey-progress';
import { PickupPIN } from '../../components/primitives/pickup-pin';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { Btn } from '../../components/primitives/btn';
import { IcMapPin } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenReadyPIN({
  session,
  pickupCode,
  secondsRemaining,
  onSwitchToQR,
  onRotate,
  isRotating = false,
  error,
}: {
  readonly session: GuestSafeSession;
  readonly pickupCode?: string | undefined;
  readonly secondsRemaining?: number | undefined;
  readonly onSwitchToQR: () => void;
  readonly onRotate?: (() => void) | undefined;
  readonly isRotating?: boolean | undefined;
  readonly error?: string | null | undefined;
}) {
  const vehicleName = `${session.vehicle.make ?? 'Vehicle'} ${session.vehicle.model ?? ''}`.trim();

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
      <StatusBadge status="success" label="Ready for pickup" />

      <div>
        <SectionTitle>Your {vehicleName} is ready.</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ color: C.blue, display: 'flex' }}>
            <IcMapPin />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: C.grey }}>
            Main Entrance · Pickup Area
          </span>
        </div>
      </div>

      {pickupCode ? (
        <PickupPIN
          code={pickupCode}
          expiresInSeconds={secondsRemaining}
          onRotate={onRotate}
          isRotating={isRotating}
        />
      ) : (
        <div
          style={{
            borderRadius: 14,
            padding: 24,
            backgroundColor: C.ice,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            className="spin"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `2px solid ${C.border}`,
              borderTopColor: C.blue,
            }}
          />
          <p style={{ fontSize: 14, color: C.grey, margin: 0 }}>
            Generating your secure pickup code...
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: `${C.danger}15`,
            color: C.danger,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn onClick={onSwitchToQR} variant="ghost" disabled={isRotating}>
          Show QR code instead
        </Btn>
      </div>
    </div>
  );
}
