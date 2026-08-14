import React from 'react';

import { C } from '../../lib/theme/colors';

export function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: C.muted,
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <h2
      className="font-display"
      style={{
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
        color: C.navy,
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

export function Divider() {
  return <div style={{ height: 1, backgroundColor: C.border, width: '100%' }} />;
}
