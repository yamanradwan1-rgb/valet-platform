'use client';

import React from 'react';

import { DemoNavigator } from './demo-navigator';
import { DevPreviewOverlayHost } from './dev-preview-overlays';
import type { DemoNavigationKey, DemoOverlayKey } from './demo-registry';

export function DevPreviewControls({
  activeScreen,
  onSelectScreen,
  overlay,
  onSelectOverlay,
  onCloseOverlay,
}: {
  readonly activeScreen: DemoNavigationKey;
  readonly onSelectScreen: (screen: DemoNavigationKey) => void;
  readonly overlay: DemoOverlayKey | null;
  readonly onSelectOverlay: (overlay: DemoOverlayKey) => void;
  readonly onCloseOverlay: () => void;
}) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <>
      <DevPreviewOverlayHost overlay={overlay} onClose={onCloseOverlay} />
      <DemoNavigator
        activeScreen={activeScreen}
        onSelectScreen={onSelectScreen}
        onSelectOverlay={onSelectOverlay}
      />
    </>
  );
}
