import React from 'react';

import { C } from '../../lib/theme/colors';
import { IcCar, IcHelp, IcWallet } from '../icons/navigation-icons';

export type CustomerTab = 'vehicle' | 'payment' | 'help';

export function BottomNav({
  tab,
  onTab,
}: {
  readonly tab: CustomerTab;
  readonly onTab: (tab: CustomerTab) => void;
}) {
  const items: {
    id: CustomerTab;
    label: string;
    Icon: (props: { className?: string }) => React.ReactNode;
  }[] = [
    { id: 'vehicle', label: 'Vehicle', Icon: (p) => <IcCar {...p} /> },
    { id: 'payment', label: 'Payment', Icon: (p) => <IcWallet {...p} /> },
    { id: 'help', label: 'Help', Icon: (p) => <IcHelp {...p} /> },
  ];

  return (
    <nav
      style={{
        borderTop: `1px solid ${C.border}`,
        backgroundColor: C.warm,
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      <div style={{ display: 'flex', width: '100%' }}>
        {items.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                paddingTop: 10,
                paddingBottom: 10,
                color: active ? C.blue : C.muted,
                minHeight: 52,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon />
              <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
