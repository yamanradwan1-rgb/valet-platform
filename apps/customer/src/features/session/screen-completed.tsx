import React from 'react';

import { Divider, SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { Btn } from '../../components/primitives/btn';
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
        gap: 24,
      }}
    >
      <StatusBadge status="success" label="Vehicle returned" />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          paddingTop: 24,
          paddingBottom: 24,
          gap: 16,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: `${C.success}18`,
            color: C.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ transform: 'scale(1.5)', display: 'flex' }}>
            <IcCheck />
          </div>
        </div>

        <div>
          <SectionTitle>Thank you.</SectionTitle>
          <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0, color: C.grey }}>
            Your {vehicleName} has been successfully released.
          </p>
        </div>

        <div
          style={{
            borderRadius: 10,
            padding: '8px 16px',
            backgroundColor: C.ice,
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: C.grey,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Session completed
          </span>
        </div>
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {onViewReceipt && (
          <Btn onClick={onViewReceipt}>View receipt preview</Btn>
        )}
        {onRateExperience && (
          <Btn onClick={onRateExperience} variant="secondary">
            Rate your experience
          </Btn>
        )}
      </div>
    </div>
  );
}
