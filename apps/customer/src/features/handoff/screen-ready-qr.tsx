import React from 'react';

import { JourneyProgress } from '../../components/primitives/journey-progress';
import { Label, SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { Btn } from '../../components/primitives/btn';
import { IcMapPin } from '../../components/icons/status-icons';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';
import { DynamicQRCode } from './qr-code';

export function ScreenReadyQR({
  session,
  qrPayload,
  secondsRemaining,
  onSwitchToPIN,
  onRotate,
  isRotating = false,
  error,
}: {
  readonly session: GuestSafeSession;
  readonly qrPayload?: string | undefined;
  readonly secondsRemaining?: number | undefined;
  readonly onSwitchToPIN: () => void;
  readonly onRotate?: (() => void) | undefined;
  readonly isRotating?: boolean | undefined;
  readonly error?: string | null | undefined;
}) {
  const vehicleName = `${session.vehicle.make ?? 'Vehicle'} ${session.vehicle.model ?? ''}`.trim();

  const formatExpiry = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = secondsRemaining !== undefined && secondsRemaining <= 0;

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
          overflow: 'hidden',
          backgroundColor: C.ice,
        }}
      >
        <div
          style={{
            padding: '20px 20px 12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Label>Pickup QR code</Label>
          {secondsRemaining !== undefined && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isExpired ? C.danger : C.grey,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isExpired ? 'Expired' : `Expires in ${formatExpiry(secondsRemaining)}`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 16 }}>
          {qrPayload ? (
            <div
              style={{
                borderRadius: 10,
                padding: 12,
                backgroundColor: '#FFFFFF',
                border: `1px solid ${C.border}`,
                opacity: isExpired ? 0.3 : 1,
              }}
            >
              <DynamicQRCode payload={qrPayload} size={180} />
            </div>
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: 10,
                backgroundColor: '#FFFFFF',
                border: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
            </div>
          )}
        </div>

        <div style={{ padding: '0 20px 20px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.grey, margin: 0 }}>
            Show this QR code to the valet
          </p>
          <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0, color: C.muted }}>
            Valid for this vehicle pickup only
          </p>

          {onRotate && (
            <button
              type="button"
              onClick={onRotate}
              disabled={isRotating}
              style={{
                marginTop: 12,
                background: 'none',
                border: 'none',
                color: C.blue,
                fontSize: 13,
                fontWeight: 600,
                cursor: isRotating ? 'not-allowed' : 'pointer',
                opacity: isRotating ? 0.5 : 1,
                padding: '4px 8px',
              }}
            >
              {isRotating ? 'Refreshing...' : 'Generate new QR code'}
            </button>
          )}
        </div>
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

      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
        <JourneyProgress step={2} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn onClick={onSwitchToPIN} variant="ghost" disabled={isRotating}>
          Show pickup code instead
        </Btn>
      </div>
    </div>
  );
}
