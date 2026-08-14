import React from 'react';

import { C } from '../../lib/theme/colors';

export type StatusBadgeType = 'info' | 'success' | 'warning' | 'active' | 'neutral';

export function StatusBadge({
  status,
  label,
}: {
  readonly status: StatusBadgeType;
  readonly label: string;
}) {
  const map: Record<StatusBadgeType, { dot: string; text: string }> = {
    info: { dot: C.blue, text: C.blue },
    success: { dot: C.success, text: C.success },
    warning: { dot: C.warning, text: C.warning },
    active: { dot: C.blue, text: C.blue },
    neutral: { dot: C.muted, text: C.grey },
  };

  const { dot, text } = map[status] ?? map.neutral;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        className={status === 'active' ? 'pulse-dot' : ''}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: dot,
          flexShrink: 0,
          display: 'block',
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 500, color: text }}>
        {label}
      </span>
    </div>
  );
}
