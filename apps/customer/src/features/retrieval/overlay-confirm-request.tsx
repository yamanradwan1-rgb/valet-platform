import React from 'react';

import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { IcClock } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function OverlayConfirmRequest({
  open,
  onConfirm,
  onClose,
  isLoading = false,
}: {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly isLoading?: boolean;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Request your vehicle?">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <p style={{ fontSize: 14, color: C.grey, margin: 0 }}>
          Your request will be queued immediately and we will notify you when it is staged at the pickup point.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: C.ice,
          }}
        >
          <div style={{ color: C.blue, display: 'flex' }}>
            <IcClock />
          </div>
          <div>
            <span style={{ fontSize: 12, color: C.grey }}>Retrieval queue</span>
            <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>
              Dispatched to valet team
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <Btn onClick={onConfirm} loading={isLoading} disabled={isLoading}>
            Request vehicle
          </Btn>
          <Btn onClick={onClose} variant="ghost" disabled={isLoading}>
            Not yet
          </Btn>
        </div>
      </div>
    </BottomSheet>
  );
}
