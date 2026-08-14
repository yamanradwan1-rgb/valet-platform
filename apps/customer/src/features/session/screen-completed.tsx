import React from 'react';

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
  const vehicleName = `${session.vehicle.make ?? 'Vehicle'} ${session.vehicle.model ?? ''}`.trim();
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
      <StatusBadge status="success" label="Session complete" />

      <div>
        <SectionTitle>Your {vehicleName} has been released.</SectionTitle>
        <p style={{ fontSize: 14, color: C.grey, marginTop: 4, marginBottom: 0 }}>
          Custody transfer is complete. Thank you for using VAYLET.
        </p>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 24,
          textAlign: 'center',
          backgroundColor: C.ice,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            backgroundColor: '#DCFCE7',
            color: '#16A34A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
          }}
        >
          <IcCheck />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: C.navy, margin: 0 }}>
          Vehicle Safely Returned
        </p>
        <p style={{ fontSize: 13, color: C.grey, marginTop: 4, marginBottom: 0 }}>
          Valet service complete
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
            borderTop: `1px dashed ${C.border}`,
            paddingTop: 16,
          }}
        >
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.grey }}>
            Dev Previews (Future Phases)
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
                  border: `1px solid ${C.border}`,
                  backgroundColor: '#FFFFFF',
                  color: C.navy,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Receipt Preview
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
                  border: `1px solid ${C.border}`,
                  backgroundColor: '#FFFFFF',
                  color: C.navy,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Rating Preview
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
