import React from 'react';

import { C } from '../../lib/theme/colors';
import { AppHeader } from './app-header';
import { BottomNav, type CustomerTab } from './bottom-nav';

export function AppShell({
  children,
  tab,
  onTab,
  onMore,
  onBack,
  headerTitle,
  showHeader = true,
  showNav = true,
  dark = false,
  whiteLabel = true,
}: {
  readonly children: React.ReactNode;
  readonly tab: CustomerTab;
  readonly onTab: (tab: CustomerTab) => void;
  readonly onMore: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly headerTitle?: string | undefined;
  readonly showHeader?: boolean | undefined;
  readonly showNav?: boolean | undefined;
  readonly dark?: boolean | undefined;
  readonly whiteLabel?: boolean | undefined;
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#E8EDF4',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 430,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: dark ? C.navy : C.warm,
          boxShadow: '0 0 60px rgba(0, 0, 0, 0.15)',
          position: 'relative',
        }}
      >
        {showHeader && (
          <AppHeader
            onMore={onMore}
            onBack={onBack}
            title={headerTitle}
            dark={dark}
            whiteLabel={whiteLabel}
          />
        )}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </main>
        {showNav && <BottomNav tab={tab} onTab={onTab} />}
      </div>
    </div>
  );
}
