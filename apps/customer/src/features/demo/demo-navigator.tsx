'use client';

import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import {
  DEMO_GROUPS,
  type DemoOverlayKey,
  type DemoScreenKey,
} from './demo-registry';

export function DemoNavigator({
  activeScreen,
  onSelectScreen,
  onSelectOverlay,
}: {
  readonly activeScreen: DemoScreenKey;
  readonly onSelectScreen: (screen: DemoScreenKey) => void;
  readonly onSelectOverlay?: (overlay: DemoOverlayKey) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<boolean>(true);

  // Strictly hidden in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        backgroundColor: 'rgba(7, 17, 31, 0.96)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
        padding: '8px 14px',
        maxWidth: 420,
        width: '92%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#FFFFFF',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: C.accent,
            }}
          />
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
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: C.accent,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {collapsed ? t('demo.expand') : t('demo.collapse')}
        </button>
      </div>

      {!collapsed && (
        <div
          style={{
            marginTop: 10,
            maxHeight: 280,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingRight: 2,
          }}
        >
          {DEMO_GROUPS.map((group) => (
            <div key={group.id}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                {t(group.titleKey)}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 6,
                }}
              >
                {group.items.map((item) => {
                  if (item.kind === 'screen') {
                    const isSelected = activeScreen === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectScreen(item.id)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '6px 8px',
                          borderRadius: 6,
                          backgroundColor: isSelected
                            ? C.accent
                            : 'rgba(255,255,255,0.08)',
                          color: isSelected
                            ? '#FFFFFF'
                            : 'rgba(255,255,255,0.85)',
                          border: isSelected
                            ? `1px solid ${C.accent}`
                            : '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          textAlign: 'start',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          transition: 'all 150ms ease',
                        }}
                      >
                        {t(item.labelKey)}
                      </button>
                    );
                  }

                  // kind === 'overlay'
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectOverlay?.(item.id)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 8px',
                        borderRadius: 6,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.75)',
                        border: '1px dashed rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                        textAlign: 'start',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {t(item.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
