import React from 'react';

import { OverlayConfirmRequest } from '../retrieval/overlay-confirm-request';
import { OverlayVehicleDetails } from '../deferred/overlay-vehicle-details';
import { OverlayMoreMenu } from '../deferred/overlay-more-menu';
import { demoSessions } from './demo-fixtures';
import type { DemoOverlayKey } from './demo-registry';

export function DevPreviewOverlayHost({
  overlay,
  onClose,
}: {
  readonly overlay: DemoOverlayKey | null;
  readonly onClose: () => void;
}) {
  if (!overlay) return null;

  switch (overlay) {
    case 'overlay-confirm-request':
      return (
        <OverlayConfirmRequest
          open={true}
          onClose={onClose}
          onConfirm={onClose}
          isLoading={false}
        />
      );
    case 'overlay-vehicle-details':
      return (
        <OverlayVehicleDetails
          open={true}
          onClose={onClose}
          session={demoSessions.parked}
        />
      );
    case 'overlay-more-menu':
      return (
        <OverlayMoreMenu
          open={true}
          onClose={onClose}
        />
      );
  }
}
