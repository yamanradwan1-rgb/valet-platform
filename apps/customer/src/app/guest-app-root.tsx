'use client';

import React, { useEffect, useState } from 'react';

import { useTranslation } from '../i18n/use-translation';
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
import {
  ScreenNetworkUnavailable,
  ScreenExpired,
} from '../features/deferred/screen-system';
import { OverlayVehicleDetails } from '../features/deferred/overlay-vehicle-details';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import { useGuestAuth } from '../features/auth/guest-auth-context';
import { DemoNavigator } from '../features/demo/demo-navigator';
import {
  type DemoNavigationKey,
  type DemoOverlayKey,
} from '../features/demo/demo-registry';
import { DemoScreenRenderer } from '../features/demo/demo-screen-renderer';
import { DevPreviewOverlayHost } from '../features/demo/dev-preview-overlays';
import { GuestLiveView } from './guest-live-view';
import { registerServiceWorker } from '../lib/pwa/register-pwa';
import { C } from '../lib/theme/colors';

const isDev = process.env.NODE_ENV !== 'production';

export function GuestAppRoot() {
  const { t } = useTranslation();
  const { token } = useGuestAuth();
  const { session, isLoading, isNetworkError, isExpired, refreshSession } = useGuestSession();
  const retrieval = useRetrieval();
  const handoff = useHandoff();

  const [tab, setTab] = useState<CustomerTab>('vehicle');
  const [demoScreen, setDemoScreen] = useState<DemoNavigationKey>('live');

  // Production Overlays
  const [showConfirmRequest, setShowConfirmRequest] = useState<boolean>(false);
  const [showVehicleDetails, setShowVehicleDetails] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  // Dedicated Dev-Only Preview Overlays (Zero Production Side Effects)
  const [devOverlay, setDevOverlay] = useState<DemoOverlayKey | null>(null);

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

  const handleOpenMore = () => setShowMoreMenu(true);
  const handleCloseMore = () => setShowMoreMenu(false);

  // 1. Dev Preview Screen Override (strictly dev-only)
  if (isDev && demoScreen !== 'live') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore}>
        <DemoScreenRenderer
          demoScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onRequestClick={() => setDevOverlay('overlay-confirm-request')}
          onViewDetails={() => setDevOverlay('overlay-vehicle-details')}
        />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        <DevPreviewOverlayHost overlay={devOverlay} onClose={() => setDevOverlay(null)} />
        <DemoNavigator
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onSelectOverlay={setDevOverlay}
        />
      </AppShell>
    );
  }

  // 2. Dev-only Tab: Payment Preview
  if (isDev && tab === 'payment') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore}>
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
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        <DemoNavigator
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onSelectOverlay={setDevOverlay}
        />
      </AppShell>
    );
  }

  // 3. Dev-only Tab: Help Preview
  if (isDev && tab === 'help') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore}>
        {helpSubScreen === 'help' && (
          <ScreenHelp onPaymentHelp={() => setTab('payment')} />
        )}
        {helpSubScreen === 'rate' && (
          <ScreenRate onDone={() => setHelpSubScreen('help')} />
        )}
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        <DemoNavigator
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onSelectOverlay={setDevOverlay}
        />
      </AppShell>
    );
  }

  // 4. Authoritative Route Resolution
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
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
        <ScreenExpired />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        {isDev && (
          <DemoNavigator
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            onSelectOverlay={setDevOverlay}
          />
        )}
      </AppShell>
    );
  }

  if (screenId === 'NETWORK_ERROR') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
        <ScreenNetworkUnavailable onRetry={() => void refreshSession()} />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        {isDev && (
          <DemoNavigator
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            onSelectOverlay={setDevOverlay}
          />
        )}
      </AppShell>
    );
  }

  if (screenId === 'LOADING') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
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
              border: `2px solid ${C.borderSemantic}`,
              borderTopColor: C.accent,
            }}
          />
          <span style={{ fontSize: 14, color: C.textSecondary }}>{t('common.loadingSession')}</span>
        </div>
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        {isDev && (
          <DemoNavigator
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            onSelectOverlay={setDevOverlay}
          />
        )}
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
        <ScreenExpired />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
      </AppShell>
    );
  }

  return (
    <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore}>
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

      {/* Production Overlays */}
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
        onClose={handleCloseMore}
      />

      {/* Dedicated Dev-Only Preview Overlays */}
      {isDev && <DevPreviewOverlayHost overlay={devOverlay} onClose={() => setDevOverlay(null)} />}

      {isDev && (
        <DemoNavigator
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onSelectOverlay={setDevOverlay}
        />
      )}
    </AppShell>
  );
}
