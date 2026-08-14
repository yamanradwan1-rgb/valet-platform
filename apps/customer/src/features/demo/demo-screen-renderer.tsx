import React from 'react';

import { ScreenParked } from '../session/screen-parked';
import { ScreenReceived } from '../session/screen-received';
import { ScreenOnTheWay } from '../session/screen-on-the-way';
import { ScreenReady } from '../session/screen-ready';
import { ScreenVerifying } from '../session/screen-verifying';
import { ScreenCompleted } from '../session/screen-completed';
import { ScreenRequested } from '../retrieval/screen-requested';
import { ScreenReadyPIN } from '../handoff/screen-ready-pin';
import { ScreenReadyQR } from '../handoff/screen-ready-qr';
import { ScreenArParked, ScreenArRequested } from '../deferred/screen-arabic';
import {
  ScreenNetworkUnavailable,
  ScreenExpired,
} from '../deferred/screen-system';
import { demoSessions } from './demo-fixtures';
import type { DemoScreenKey } from './demo-navigator';

export function DemoScreenRenderer({
  demoScreen,
  onSelectScreen,
  onRequestClick,
  onViewDetails,
}: {
  readonly demoScreen: DemoScreenKey;
  readonly onSelectScreen: (screen: DemoScreenKey) => void;
  readonly onRequestClick: () => void;
  readonly onViewDetails: () => void;
}) {
  switch (demoScreen) {
    case 'demo-received':
      return <ScreenReceived session={demoSessions.received} onRefresh={() => {}} />;
    case 'demo-parked':
      return (
        <ScreenParked
          session={demoSessions.parked}
          onRequestClick={onRequestClick}
          onViewDetails={onViewDetails}
        />
      );
    case 'demo-requested':
      return <ScreenRequested session={demoSessions.requested} onCancel={() => {}} />;
    case 'demo-on-the-way':
      return <ScreenOnTheWay session={demoSessions.retrieving} />;
    case 'demo-ready':
      return <ScreenReady session={demoSessions.ready} />;
    case 'demo-ready-pin':
      return (
        <ScreenReadyPIN
          session={demoSessions.handoff_pending}
          pickupCode="4821"
          secondsRemaining={114}
          onSwitchToQR={() => onSelectScreen('demo-ready-qr')}
        />
      );
    case 'demo-ready-qr':
      return (
        <ScreenReadyQR
          session={demoSessions.handoff_pending}
          qrPayload="vhq1.demo-valet-session.test-payload"
          secondsRemaining={114}
          onSwitchToPIN={() => onSelectScreen('demo-ready-pin')}
        />
      );
    case 'demo-verifying':
      return <ScreenVerifying />;
    case 'demo-completed':
      return <ScreenCompleted session={demoSessions.completed} />;
    case 'demo-network-unavailable':
      return <ScreenNetworkUnavailable onRetry={() => {}} lastKnownState="PARKED" />;
    case 'demo-expired':
      return <ScreenExpired />;
    case 'demo-arabic-parked':
      return <ScreenArParked onRequestVehicle={() => {}} onViewDetails={() => {}} />;
    case 'demo-arabic-requested':
      return <ScreenArRequested />;
    default:
      return null;
  }
}
