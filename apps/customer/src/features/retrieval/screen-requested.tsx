import React from 'react';

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
  error,
}: {
  readonly session: GuestSafeSession;
  readonly onCancel: () => void;
  readonly isCancelling?: boolean;
  readonly error?: string | null;
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
      <StatusBadge status="active" label="Vehicle requested" />

      <VehicleHero
        make={session.vehicle.make}
        model={session.vehicle.model}
        color={session.vehicle.color}
      />

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, color: C.navy, margin: 0 }}>
          Your request has been received.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ color: C.blue, display: 'flex' }}>
            <IcClock />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.blue }}>
            Queued for valet retrieval
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
            backgroundColor: `${C.danger}15`,
            color: C.danger,
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
          disabled={isCancelling}
          style={{
            width: '100%',
            textAlign: 'center',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: isCancelling ? C.muted : C.grey,
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            cursor: isCancelling ? 'not-allowed' : 'pointer',
            transition: 'opacity 150ms ease',
          }}
        >
          {isCancelling ? 'Cancelling request...' : 'Cancel request'}
        </button>
      </div>
    </div>
  );
}
