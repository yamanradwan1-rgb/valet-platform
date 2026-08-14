import React from 'react';

import { JourneyProgress } from '../../components/primitives/journey-progress';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { IcMapPin } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenReady({
  session,
}: {
  readonly session: GuestSafeSession;
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

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, color: C.navy, margin: 0 }}>
          Your valet is preparing secure handoff.
        </p>
        <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0, color: C.grey }}>
          Your one-time pickup code or QR will appear as soon as the valet begins verification.
        </p>
      </div>

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      <TrustStrip />
    </div>
  );
}
