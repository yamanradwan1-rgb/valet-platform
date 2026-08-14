import React from 'react';

import { InfoRow } from '../../components/primitives/info-row';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { VehicleHero } from '../../components/primitives/vehicle-hero';
import { Btn } from '../../components/primitives/btn';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

export function ScreenParked({
  session,
  onRequestClick,
  onViewDetails,
}: {
  readonly session: GuestSafeSession;
  readonly onRequestClick: () => void;
  readonly onViewDetails: () => void;
}) {
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
      <StatusBadge status="success" label="Safely parked" />

      <VehicleHero
        make={session.vehicle.make}
        model={session.vehicle.model}
        color={session.vehicle.color}
      />

      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <InfoRow label="Location" value="Secure parking" />
        <InfoRow label="Status" value="Safely parked" showBorder={false} />
      </div>

      <TrustStrip />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <Btn onClick={onRequestClick}>Request vehicle</Btn>
        <Btn onClick={onViewDetails} variant="ghost">
          View vehicle details
        </Btn>
      </div>
    </div>
  );
}
