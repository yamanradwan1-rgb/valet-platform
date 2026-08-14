import React from 'react';

import { C } from '../../lib/theme/colors';

export function InfoRow({
  label,
  value,
  highlight = false,
  mono = false,
  showBorder = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly highlight?: boolean;
  readonly mono?: boolean;
  readonly showBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingBottom: 16,
        borderBottom: showBorder ? `1px solid ${C.border}` : 'none',
      }}
    >
      <span style={{ fontSize: 14, color: C.grey }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: highlight ? C.blue : C.navy,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  );
}
