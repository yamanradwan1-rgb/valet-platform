'use client';

import React, { useEffect, useState } from 'react';

import { AppShell } from '../components/layout/app-shell';
import type { CustomerTab } from '../components/layout/bottom-nav';
import { useGuestSession } from '../features/session/use-guest-session';
import { resolveGuestScreenId } from '../features/session/guest-lifecycle-router';
import { useRetrieval } from '../features/retrieval/use-retrieval';
import { OverlayConfirmRequest } from '../features/retrieval/overlay-confirm-request';
import { useHandoff } from '../features/handoff/use-handoff';
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
import { useGuestAuth } from '../features/auth/guest-auth-context';
import { DemoNavigator, type DemoScreenKey } from '../features/demo/demo-navigator';
import { DemoScreenRenderer } from '../features/demo/demo-screen-renderer';
import { GuestLiveView } from './guest-live-view';
import { registerServiceWorker } from '../lib/pwa/register-pwa';
import { C } from '../lib/theme/colors';

const isDev = process.env.NODE_ENV !== 'production';

export function GuestAppRoot() {
  const { token } = useGuestAuth();
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

  // Sub-screens for dev preview flows
  const [paymentSubScreen, setPaymentSubScreen] = useState<'overview' | 'tip' | 'receipt'>('overview');
  const [helpSubScreen, setHelpSubScreen] = useState<'help' | 'rate'>('help');

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const handleRequestConfirm = async () => {
    const ok = await retrieval.requestVehicle();
    if (ok) setShowConfirmRequest(false);
  };

  // 1. Dev Preview Screen Override (strictly dev-only)
  if (isDev && demoScreen !== 'live') {
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

  // 2. Dev-only Tab: Payment Preview
  if (isDev && tab === 'payment') {
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

  // 3. Dev-only Tab: Help Preview
  if (isDev && tab === 'help') {
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

  // 4. Dev-only Arabic RTL Preview
  if (isDev && showArabicPreview) {
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

  // 5. Authoritative Route Resolution
  const screenId = resolveGuestScreenId({
    hasToken: Boolean(token),
    isExpired,
    isNetworkError,
    isLoading,
    session,
    handoffMethod: handoff.activeMethod,
  });

  if (screenId === 'UNAVAILABLE') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
        <ScreenExpired />
        {isDev && <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />}
      </AppShell>
    );
  }

  if (screenId === 'NETWORK_ERROR') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
        <ScreenNetworkUnavailable onRetry={() => void refreshSession()} />
        {isDev && <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />}
      </AppShell>
    );
  }

  if (screenId === 'LOADING') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
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
        {isDev && <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />}
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={() => {}} showNav={false}>
        <ScreenExpired />
      </AppShell>
    );
  }

  return (
    <AppShell tab={tab} onTab={setTab} onMore={() => setShowMoreMenu(true)}>
      <GuestLiveView
        screenId={screenId}
        session={session}
        retrieval={retrieval}
        handoff={handoff}
        onRefreshSession={() => void refreshSession()}
        onRequestVehicle={() => setShowConfirmRequest(true)}
        onViewDetails={() => setShowVehicleDetails(true)}
        onViewReceipt={isDev ? () => setTab('payment') : undefined}
        onRateExperience={
          isDev
            ? () => {
                setTab('help');
                setHelpSubScreen('rate');
              }
            : undefined
        }
      />

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
        onOpenArabicPreview={isDev ? () => setShowArabicPreview(true) : undefined}
      />

      {isDev && <DemoNavigator activeScreen={demoScreen} onSelectScreen={setDemoScreen} />}
    </AppShell>
  );
}
