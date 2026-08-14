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
import {
  ScreenPaymentOverview,
  ScreenAddTip,
  ScreenReceipt,
} from '../deferred/screen-payment';
import { ScreenPaymentComplimentary } from '../deferred/screen-payment-complimentary';
import { ScreenPaymentMethod } from '../deferred/screen-payment-method';
import { ScreenPaymentSuccess } from '../deferred/screen-payment-success';
import { ScreenPaymentError } from '../deferred/screen-payment-error';
import { ScreenRate, ScreenHelp } from '../deferred/screen-service';
import { ScreenReportIssue } from '../deferred/screen-report-issue';
import { ScreenReportSubmitted } from '../deferred/screen-report-submitted';
import {
  ScreenNetworkUnavailable,
  ScreenRequestError,
  ScreenExpired,
} from '../deferred/screen-system';
import { demoSessions } from './demo-fixtures';
import type { DemoRenderableScreenKey } from './demo-registry';

export function DemoScreenRenderer({
  demoScreen,
  onSelectScreen,
  onRequestClick,
  onViewDetails,
}: {
  readonly demoScreen: DemoRenderableScreenKey;
  readonly onSelectScreen: (screen: DemoRenderableScreenKey) => void;
  readonly onRequestClick: () => void;
  readonly onViewDetails: () => void;
}) {
  switch (demoScreen) {
    // --- Core / Vehicle ---
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
      return (
        <ScreenCompleted
          session={demoSessions.completed}
          onViewReceipt={() => onSelectScreen('demo-receipt')}
          onRateExperience={() => onSelectScreen('demo-rate-experience')}
        />
      );

    // --- Payment ---
    case 'demo-payment-overview':
      return (
        <ScreenPaymentOverview
          onAddTip={() => onSelectScreen('demo-add-tip')}
          onPay={() => onSelectScreen('demo-payment-method')}
        />
      );
    case 'demo-payment-complimentary':
      return (
        <ScreenPaymentComplimentary
          onViewReceipt={() => onSelectScreen('demo-receipt')}
          onDone={() => onSelectScreen('demo-parked')}
        />
      );
    case 'demo-add-tip':
      return <ScreenAddTip onContinue={() => onSelectScreen('demo-payment-overview')} />;
    case 'demo-payment-method':
      return (
        <ScreenPaymentMethod
          onPaySuccess={() => onSelectScreen('demo-payment-success')}
        />
      );
    case 'demo-payment-success':
      return (
        <ScreenPaymentSuccess
          onViewReceipt={() => onSelectScreen('demo-receipt')}
          onDone={() => onSelectScreen('demo-completed')}
        />
      );
    case 'demo-receipt':
      return <ScreenReceipt onDone={() => onSelectScreen('demo-payment-overview')} />;

    // --- Service ---
    case 'demo-rate-experience':
      return <ScreenRate onDone={() => onSelectScreen('demo-help')} />;
    case 'demo-report-issue':
      return (
        <ScreenReportIssue
          session={demoSessions.parked}
          onSubmit={() => onSelectScreen('demo-issue-submitted')}
        />
      );
    case 'demo-issue-submitted':
      return <ScreenReportSubmitted onDone={() => onSelectScreen('demo-parked')} />;
    case 'demo-help':
      return <ScreenHelp onPaymentHelp={() => onSelectScreen('demo-payment-overview')} />;

    // --- Errors ---
    case 'demo-network-unavailable':
      return <ScreenNetworkUnavailable onRetry={() => onSelectScreen('demo-parked')} lastKnownState="PARKED" />;
    case 'demo-payment-error':
      return (
        <ScreenPaymentError
          onRetry={() => onSelectScreen('demo-payment-method')}
          onChangeMethod={() => onSelectScreen('demo-payment-method')}
        />
      );
    case 'demo-request-error':
      return (
        <ScreenRequestError
          onRetry={() => onSelectScreen('demo-requested')}
        />
      );
    case 'demo-expired':
      return <ScreenExpired />;

    default: {
      const exhaustiveCheck: never = demoScreen;
      return exhaustiveCheck;
    }
  }
}
