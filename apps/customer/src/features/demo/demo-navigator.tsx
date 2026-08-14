'use client';

import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import type { TranslationKey } from '../../i18n/translations/types';
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
  | 'demo-expired';

export function DemoNavigator({
  activeScreen,
  onSelectScreen,
}: {
  readonly activeScreen: DemoScreenKey;
  readonly onSelectScreen: (screen: DemoScreenKey) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<boolean>(true);

  // Strictly hidden in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const screens: { id: DemoScreenKey; labelKey: TranslationKey }[] = [
    { id: 'live', labelKey: 'demo.live' },
    { id: 'demo-received', labelKey: 'demo.received' },
    { id: 'demo-parked', labelKey: 'demo.parked' },
    { id: 'demo-requested', labelKey: 'demo.requested' },
    { id: 'demo-on-the-way', labelKey: 'demo.onTheWay' },
    { id: 'demo-ready', labelKey: 'demo.ready' },
    { id: 'demo-ready-pin', labelKey: 'demo.readyPin' },
    { id: 'demo-ready-qr', labelKey: 'demo.readyQr' },
    { id: 'demo-verifying', labelKey: 'demo.verifying' },
    { id: 'demo-completed', labelKey: 'demo.completed' },
    { id: 'demo-network-unavailable', labelKey: 'demo.networkUnavailable' },
    { id: 'demo-expired', labelKey: 'demo.expired' },
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
          {t('demo.navigatorTitle')}
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
          {collapsed ? t('demo.expand') : t('demo.collapse')}
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
          {screens.map(({ id, labelKey }) => {
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
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
