'use client';

import React, { useEffect, useState } from 'react';

import { AppShell } from '../components/layout/app-shell';
import type { CustomerTab } from '../components/layout/bottom-nav';
import { ScreenParked } from '../features/session/screen-parked';
import { ScreenReceived } from '../features/session/screen-received';
import { ScreenOnTheWay } from '../features/session/screen-on-the-way';
import { ScreenReady } from '../features/session/screen-ready';
import { ScreenCompleted } from '../features/session/screen-completed';
import { useGuestSession } from '../features/session/use-guest-session';
import { useRetrieval } from '../features/retrieval/use-retrieval';
import { ScreenRequested } from '../features/retrieval/screen-requested';
import { OverlayConfirmRequest } from '../features/retrieval/overlay-confirm-request';
import { useHandoff } from '../features/handoff/use-handoff';
import { ScreenReadyPIN } from '../features/handoff/screen-ready-pin';
import { ScreenReadyQR } from '../features/handoff/screen-ready-qr';
import {
  ScreenPaymentOverview,
  ScreenAddTip,
  ScreenReceipt,
} from '../features/deferred/screen-payment';
import { ScreenRate, ScreenHelp } from '../features/deferred/screen-service';
import { ScreenArParked } from '../features/deferred/screen-arabic';
import {
  ScreenNetworkUnavailable,
  ScreenExpired,
} from '../features/deferred/screen-system';
import { OverlayVehicleDetails } from '../features/deferred/overlay-vehicle-details';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import { DemoNavigator, type DemoScreenKey } from '../features/demo/demo-navigator';
import { DemoScreenRenderer } from '../features/demo/demo-screen-renderer';
import { demoSessions } from '../features/demo/demo-fixtures';
import { registerServiceWorker } from '../lib/pwa/register-pwa';
import { C } from '../lib/theme/colors';

export function GuestAppRoot() {
  const { session, isLoading, isNetworkError, isExpired, refreshSession } = useGuestSession();
  const retrieval = useRetrieval();
  const handoff = useHandoff();

  const [tab, setTab] = useState<CustomerTab>('vehicle');
  const [demoScreen, setDemoScreen] = useState<DemoScreenKey>('live');

  // Overlays
  const [showConfirmRequest, setShowConfirmRequest] = useState(false);
  const [showVehicleDetails, setShowVehicleDetails] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showArabicPreview, setShowArabicPreview] = useState(false);

  // Sub-screens for preview flows
  const [paymentSubScreen, setPaymentSubScreen] = useState<'overview' | 'tip' | 'receipt'>('overview');
  const [helpSubScreen, setHelpSubScreen] = useState<'help' | 'rate'>('help');

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const handleRequestConfirm = async () => {
    const ok = await retrieval.requestVehicle();
    if (ok) setShowConfirmRequest(false);
  };

  // 1. System state screens
  if (isExpired && demoScreen === 'live') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
        <ScreenExpired />
      </AppShell>
    );
  }

  if (isNetworkError && !session && demoScreen === 'live') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
        <ScreenNetworkUnavailable onRetry={() => void refreshSession()} />
      </AppShell>
    );
  }

  // 2. Render Demo Screens if selected in Dev
  if (demoScreen !== 'live') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => setShowMoreMenu(true)}>
        <DemoScreenRenderer
          demoScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onRequestClick={() => setShowConfirmRequest(true)}
          onViewDetails={() => setShowVehicleDetails(true)}
        />
        <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />
      </AppShell>
    );
  }

  // 3. Tab: Payment Preview
  if (tab === 'payment') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => setShowMoreMenu(true)}>
        {paymentSubScreen === 'overview' && (
          <ScreenPaymentOverview
            onAddTip={() => setPaymentSubScreen('tip')}
            onPay={() => setPaymentSubScreen('receipt')}
          />
        )}
        {paymentSubScreen === 'tip' && (
          <ScreenAddTip onContinue={() => setPaymentSubScreen('overview')} />
        )}
        {paymentSubScreen === 'receipt' && (
          <ScreenReceipt onDone={() => setPaymentSubScreen('overview')} />
        )}
        <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />
      </AppShell>
    );
  }

  // 4. Tab: Help Preview
  if (tab === 'help') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => setShowMoreMenu(true)}>
        {helpSubScreen === 'help' && (
          <ScreenHelp onPaymentHelp={() => setTab('payment')} />
        )}
        {helpSubScreen === 'rate' && (
          <ScreenRate onDone={() => setHelpSubScreen('help')} />
        )}
        <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />
      </AppShell>
    );
  }

  // 5. Arabic RTL Preview Overlay
  if (showArabicPreview) {
    return (
      <AppShell
        tab={tab}
        onTab={setTab}
        onMore={() => setShowArabicPreview(false)}
        onBack={() => setShowArabicPreview(false)}
        headerTitle="عربي (معاينة)"
      >
        <ScreenArParked
          onRequestVehicle={() => {}}
          onViewDetails={() => setShowVehicleDetails(true)}
        />
        <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />
      </AppShell>
    );
  }

  // 6. Loading state
  if (isLoading && !session) {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: 16,
          }}
        >
          <div
            className="spin"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: `2px solid ${C.border}`,
              borderTopColor: C.blue,
            }}
          />
          <span style={{ fontSize: 14, color: C.grey }}>Loading valet session...</span>
        </div>
      </AppShell>
    );
  }

  // 7. Authoritative Session Lifecycle Routing
  return (
    <AppShell tab={tab} onTab={setTab} onMore={() => setShowMoreMenu(true)}>
      {(!session ||
        session.state === 'CHECKING_IN' ||
        session.state === 'AWAITING_PARKING' ||
        session.state === 'PARKING') && (
        <ScreenReceived
          session={session ?? demoSessions.received}
          onRefresh={() => void refreshSession()}
        />
      )}

      {session?.state === 'PARKED' && (
        <ScreenParked
          session={session}
          onRequestClick={() => setShowConfirmRequest(true)}
          onViewDetails={() => setShowVehicleDetails(true)}
        />
      )}

      {session?.state === 'REQUESTED' && (
        <ScreenRequested
          session={session}
          onCancel={() => void retrieval.cancelRetrieval()}
          isCancelling={retrieval.isCancelling}
          error={retrieval.actionError}
        />
      )}

      {session?.state === 'RETRIEVING' && <ScreenOnTheWay session={session} />}

      {session?.state === 'READY' && <ScreenReady session={session} />}

      {session?.state === 'HANDOFF_PENDING' && (
        <>
          {handoff.activeMethod === 'PICKUP_CODE' ? (
            <ScreenReadyPIN
              session={session}
              pickupCode={
                handoff.material?.method === 'PICKUP_CODE'
                  ? handoff.material.pickupCode
                  : undefined
              }
              secondsRemaining={handoff.secondsRemaining}
              onSwitchToQR={() => void handoff.switchMethod('DYNAMIC_QR')}
              onRotate={() => void handoff.rotateCurrent()}
              isRotating={handoff.isRotating}
              error={handoff.error}
            />
          ) : (
            <ScreenReadyQR
              session={session}
              qrPayload={
                handoff.material?.method === 'DYNAMIC_QR'
                  ? handoff.material.qrPayload
                  : undefined
              }
              secondsRemaining={handoff.secondsRemaining}
              onSwitchToPIN={() => void handoff.switchMethod('PICKUP_CODE')}
              onRotate={() => void handoff.rotateCurrent()}
              isRotating={handoff.isRotating}
              error={handoff.error}
            />
          )}
        </>
      )}

      {session?.state === 'COMPLETED' && (
        <ScreenCompleted
          session={session}
          onViewReceipt={() => setTab('payment')}
          onRateExperience={() => {
            setTab('help');
            setHelpSubScreen('rate');
          }}
        />
      )}

      <OverlayConfirmRequest
        open={showConfirmRequest}
        onClose={() => setShowConfirmRequest(false)}
        onConfirm={handleRequestConfirm}
        isLoading={retrieval.isRequesting}
      />

      <OverlayVehicleDetails
        open={showVehicleDetails}
        onClose={() => setShowVehicleDetails(false)}
        session={session}
      />

      <OverlayMoreMenu
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        onOpenArabicPreview={() => setShowArabicPreview(true)}
      />

      <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />
    </AppShell>
  );
}
