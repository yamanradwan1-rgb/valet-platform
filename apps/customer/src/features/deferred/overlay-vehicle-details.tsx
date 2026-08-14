import React from 'react';

import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';

export function OverlayVehicleDetails({
  open,
  onClose,
  session,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly session: GuestSafeSession | null;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Vehicle details">
      <div style={{ paddingTop: 8 }}>
        <InfoRow label="Make" value={session?.vehicle.make ?? 'Unknown'} />
        <InfoRow label="Model" value={session?.vehicle.model ?? 'Unknown'} />
        <InfoRow label="Color" value={session?.vehicle.color ?? 'Not specified'} />
        <InfoRow label="Status" value={session?.state ?? 'Unknown'} showBorder={false} />
      </div>
      <div style={{ paddingTop: 16 }}>
        <Btn onClick={onClose} variant="secondary">
          Close
        </Btn>
      </div>
    </BottomSheet>
  );
}
