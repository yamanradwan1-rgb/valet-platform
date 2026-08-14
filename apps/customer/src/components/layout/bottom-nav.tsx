import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { IcCar, IcWallet, IcHelp } from '../icons/navigation-icons';
import { C } from '../../lib/theme/colors';

export type CustomerTab = 'vehicle' | 'payment' | 'help';

export interface BottomNavProps {
  readonly tab: CustomerTab;
  readonly onTab: (tab: CustomerTab) => void;
}

export function BottomNav({ tab, onTab }: BottomNavProps) {
  const { t } = useTranslation();
  const isDev = process.env.NODE_ENV !== 'production';

  // In production, deferred tabs (payment, help) are hidden until their backend phase
  if (!isDev) {
    return null;
  }

  const tabs: { id: CustomerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'vehicle', label: t('nav.vehicle'), icon: <IcCar /> },
    { id: 'payment', label: t('nav.payment'), icon: <IcWallet /> },
    { id: 'help', label: t('nav.help'), icon: <IcHelp /> },
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
      aria-label={t('nav.vehicle')}
    >
      {tabs.map((tabItem) => {
        const active = tab === tabItem.id;
        return (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => onTab(tabItem.id)}
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
              {tabItem.icon}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
              }}
            >
              {tabItem.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
