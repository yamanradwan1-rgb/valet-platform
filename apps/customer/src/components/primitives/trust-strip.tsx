import React from 'react';

import { C } from '../../lib/theme/colors';
import { IcShieldCheck } from '../icons/status-icons';

export function TrustStrip() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        padding: '12px 16px',
        backgroundColor: C.ice,
      }}
    >
      <div style={{ color: C.blue, display: 'flex', flexShrink: 0 }}>
        <IcShieldCheck />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>
          Protected handoff
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: C.grey }}>
          One-time pickup verification
        </div>
      </div>
    </div>
  );
}
