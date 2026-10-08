'use client';

import React, { useEffect, useState } from 'react';

import { AppShell } from '../components/layout/app-shell';
import type { CustomerTab } from '../components/layout/bottom-nav';
import { useGuestSession } from '../features/session/use-guest-session';
import { resolveGuestScreenId } from '../features/session/guest-lifecycle-router';
import { useRetrieval } from '../features/retrieval/use-retrieval';
import { useHandoff } from '../features/handoff/use-handoff';
import {
  ScreenPaymentOverview,
  ScreenAddTip,
  ScreenReceipt,
} from '../features/deferred/screen-payment';
import { ScreenHelp } from '../features/deferred/screen-service';
import { GuestLiveRating } from '../features/rating/guest-live-rating';
import { GuestPostVisitRoute, type GuestPostVisitSelection } from './guest-post-visit-route';
import { GuestWebPushMount } from './guest-web-push-mount';
import {
  ScreenNetworkUnavailable,
  ScreenExpired,
} from '../features/deferred/screen-system';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import { useGuestAuth } from '../features/auth/guest-auth-context';
import {
  type DemoNavigationKey,
  type DemoOverlayKey,
} from '../features/demo/demo-registry';
import { DemoScreenRenderer } from '../features/demo/demo-screen-renderer';
import { DevPreviewControls } from '../features/demo/dev-preview-controls';
import { GuestLiveView } from './guest-live-view';
import { GuestLiveOverlays } from './guest-live-overlays';
import { GuestFreshnessNotice } from './guest-freshness-notice';
import { GuestSessionLoading } from './guest-session-loading';
import { registerServiceWorker } from '../lib/pwa/register-pwa';

const isDev = process.env.NODE_ENV !== 'production';

export function GuestAppRoot() {
  const {
    client,
    isTokenBootstrapComplete,
    isBootstrapTemporarilyUnavailable,
    retryBootstrap,
  } = useGuestAuth();
  const { session, isLoading, isNetworkError, isExpired, isFresh, isStale, isRefreshing, isMutating, failureKind, cooldownSeconds, refreshSession } = useGuestSession();
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
  const [postVisit, setPostVisit] = useState<GuestPostVisitSelection | null>(null);

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
        <DevPreviewControls
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          overlay={devOverlay}
          onSelectOverlay={setDevOverlay}
          onCloseOverlay={() => setDevOverlay(null)}
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
        <DevPreviewControls
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          overlay={devOverlay}
          onSelectOverlay={setDevOverlay}
          onCloseOverlay={() => setDevOverlay(null)}
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
          <GuestLiveRating
            client={client}
            visitId={session?.valetSessionId ?? null}
            canRate={Boolean(client && session?.state === 'COMPLETED' && !isExpired && !isNetworkError)}
            onBack={() => setHelpSubScreen('help')}
          />
        )}
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        <DevPreviewControls
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          overlay={devOverlay}
          onSelectOverlay={setDevOverlay}
          onCloseOverlay={() => setDevOverlay(null)}
        />
      </AppShell>
    );
  }

  // 4. Authoritative Route Resolution
  const screenId = resolveGuestScreenId({
    hasAuthority: Boolean(client),
    isTokenBootstrapComplete,
    isAuthBootstrapUnavailable: isBootstrapTemporarilyUnavailable,
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
          <DevPreviewControls
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            overlay={devOverlay}
            onSelectOverlay={setDevOverlay}
            onCloseOverlay={() => setDevOverlay(null)}
          />
        )}
      </AppShell>
    );
  }

  if (screenId === 'NETWORK_ERROR') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
        <ScreenNetworkUnavailable
          failureKind={isBootstrapTemporarilyUnavailable ? 'UNAVAILABLE' : failureKind}
          retryAfterSeconds={cooldownSeconds}
          onRetry={() =>
            void (isBootstrapTemporarilyUnavailable ? retryBootstrap() : refreshSession())
          }
        />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        {isDev && (
          <DevPreviewControls
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            overlay={devOverlay}
            onSelectOverlay={setDevOverlay}
            onCloseOverlay={() => setDevOverlay(null)}
          />
        )}
      </AppShell>
    );
  }

  if (screenId === 'LOADING') {
    return (
      <AppShell tab={tab} onTab={setTab} onMore={handleOpenMore} showNav={false}>
        <GuestSessionLoading />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} />
        {isDev && (
          <DevPreviewControls
            activeScreen={demoScreen}
            onSelectScreen={setDemoScreen}
            overlay={devOverlay}
            onSelectOverlay={setDevOverlay}
            onCloseOverlay={() => setDevOverlay(null)}
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

  if (
    postVisit && client && session.state === 'COMPLETED' &&
    postVisit.visitId === session.valetSessionId && !isExpired
  ) {
    return (
      <GuestPostVisitRoute client={client} session={session} surface={postVisit.surface}
        tab={tab} onBack={() => setPostVisit(null)} onCloseMore={handleCloseMore} onMore={handleOpenMore}
        onTab={setTab} showMoreMenu={showMoreMenu} />
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
        onRequestVehicle={() => { if (isFresh && !isMutating) setShowConfirmRequest(true); }}
        canMutate={isFresh && !isMutating}
        isRefreshing={isRefreshing}
        onViewDetails={() => setShowVehicleDetails(true)}
        onViewReceipt={() => setPostVisit({ surface: 'payment', visitId: session.valetSessionId })}
        onRateExperience={() => setPostVisit({ surface: 'rating', visitId: session.valetSessionId })}
      />

      {/* Production Overlays */}
      <GuestLiveOverlays
        session={session}
        showConfirmRequest={showConfirmRequest}
        showVehicleDetails={showVehicleDetails}
        showMoreMenu={showMoreMenu}
        onCloseConfirm={() => setShowConfirmRequest(false)}
        onConfirm={handleRequestConfirm}
        onCloseDetails={() => setShowVehicleDetails(false)}
        onCloseMore={handleCloseMore}
        isRequesting={retrieval.isRequesting}
        requestError={retrieval.actionError}
        canRequest={isFresh && !isMutating}
      />

      <GuestFreshnessNotice
        visible={isStale}
        cooldownSeconds={cooldownSeconds}
        isRefreshing={isRefreshing}
        onRefresh={() => void refreshSession()}
      />

      <GuestWebPushMount enabled={Boolean(client && isTokenBootstrapComplete && !isExpired)} session={session} />

      {/* Dedicated Dev-Only Preview Overlays and Navigator */}
      {isDev && (
        <DevPreviewControls
          activeScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          overlay={devOverlay}
          onSelectOverlay={setDevOverlay}
          onCloseOverlay={() => setDevOverlay(null)}
        />
      )}
    </AppShell>
  );
}
