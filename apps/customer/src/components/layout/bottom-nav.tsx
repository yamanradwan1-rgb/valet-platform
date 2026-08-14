import React from 'react';

import { IcCar, IcWallet, IcHelp } from '../icons/navigation-icons';
import { C } from '../../lib/theme/colors';

export type CustomerTab = 'vehicle' | 'payment' | 'help';

export interface BottomNavProps {
  readonly tab: CustomerTab;
  readonly onTab: (tab: CustomerTab) => void;
}

export function BottomNav({ tab, onTab }: BottomNavProps) {
  const isDev = process.env.NODE_ENV !== 'production';

  // In production, deferred tabs (payment, help) are hidden until their backend phase
  if (!isDev) {
    return null;
  }

  const tabs: { id: CustomerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'vehicle', label: 'Vehicle', icon: <IcCar /> },
    { id: 'payment', label: 'Payment (Preview)', icon: <IcWallet /> },
    { id: 'help', label: 'Help (Preview)', icon: <IcHelp /> },
  ];

  return (
    <nav
      style={{
        display: 'flex',
        borderTop: `1px solid ${C.border}`,
        backgroundColor: '#FFFFFF',
        height: 64,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      role="navigation"
      aria-label="Guest navigation"
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? C.navy : C.grey,
            }}
          >
            <div style={{ color: active ? C.navy : C.grey, display: 'flex' }}>
              {t.icon}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
