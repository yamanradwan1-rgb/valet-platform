'use client';

import React, { useState } from 'react';

import { C } from '../../lib/theme/colors';

export type DemoScreenKey =
  | 'live'
  | 'demo-received'
  | 'demo-parked'
  | 'demo-requested'
  | 'demo-on-the-way'
  | 'demo-ready'
  | 'demo-ready-pin'
  | 'demo-ready-qr'
  | 'demo-verifying'
  | 'demo-completed'
  | 'demo-network-unavailable'
  | 'demo-expired'
  | 'demo-arabic-parked'
  | 'demo-arabic-requested';

export function DemoNavigator({
  activeScreen,
  onSelectScreen,
}: {
  readonly activeScreen: DemoScreenKey;
  readonly onSelectScreen: (screen: DemoScreenKey) => void;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(true);

  // Strictly hidden in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const screens: { id: DemoScreenKey; label: string }[] = [
    { id: 'live', label: '🟢 Live (API)' },
    { id: 'demo-received', label: '1. Received' },
    { id: 'demo-parked', label: '2. Parked' },
    { id: 'demo-requested', label: '3. Requested' },
    { id: 'demo-on-the-way', label: '4. On the way' },
    { id: 'demo-ready', label: '5. Ready (Wait)' },
    { id: 'demo-ready-pin', label: '6. PIN Handoff' },
    { id: 'demo-ready-qr', label: '7. QR Handoff' },
    { id: 'demo-verifying', label: '8. Verifying' },
    { id: 'demo-completed', label: '9. Completed' },
    { id: 'demo-network-unavailable', label: 'Net Unavailable' },
    { id: 'demo-expired', label: 'Expired' },
    { id: 'demo-arabic-parked', label: 'AR: Parked' },
    { id: 'demo-arabic-requested', label: 'AR: Requested' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        backgroundColor: 'rgba(7, 17, 31, 0.95)',
        backdropFilter: 'blur(8px)',
        borderRadius: 16,
        padding: '6px 12px',
        maxWidth: 390,
        width: '92%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Dev Preview Navigator
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: C.blue,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 8,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {screens.map(({ id, label }) => {
            const isSelected = activeScreen === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectScreen(id)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  backgroundColor: isSelected ? C.blue : 'rgba(255,255,255,0.08)',
                  color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
