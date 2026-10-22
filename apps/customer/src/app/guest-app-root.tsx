'use client';

import React, { useEffect, useState } from 'react';

import { AppShell } from '../components/layout/app-shell';
import { useGuestSession } from '../features/session/use-guest-session';
import { resolveGuestScreenId } from '../features/session/guest-lifecycle-router';
import { useRetrieval } from '../features/retrieval/use-retrieval';
import { useHandoff } from '../features/handoff/use-handoff';
import { GuestPostVisitRoute } from './guest-post-visit-route';
import { useGuestPostVisit } from '../features/post-visit/use-guest-post-visit';
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
    token,
    isTokenBootstrapComplete,
    isBootstrapTemporarilyUnavailable,
    retryBootstrap,
    isContextSwitching,
    isContextSwitchOutcomeAmbiguous,
    contextConflictScope,
  } = useGuestAuth();
  const { session, isLoading, isNetworkError, isExpired, isFresh, isStale, isRefreshing, isMutating, failureKind, cooldownSeconds, refreshSession } = useGuestSession();
  const retrieval = useRetrieval();
  const handoff = useHandoff();

  const [demoScreen, setDemoScreen] = useState<DemoNavigationKey>('live');

  // Production Overlays
  const [showConfirmRequest, setShowConfirmRequest] = useState<boolean>(false);
  const [showVehicleDetails, setShowVehicleDetails] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  // Dedicated Dev-Only Preview Overlays (Zero Production Side Effects)
  const [devOverlay, setDevOverlay] = useState<DemoOverlayKey | null>(null);

  const canRemainPostVisit = Boolean(client && isTokenBootstrapComplete &&
    !isBootstrapTemporarilyUnavailable && !isContextSwitching &&
    !isContextSwitchOutcomeAmbiguous && !contextConflictScope &&
    !isExpired && !isNetworkError && session?.state === 'COMPLETED');
  const postVisit = useGuestPostVisit({
    client, session,
    hasBrowserSession: token === null,
    canEnter: canRemainPostVisit && isFresh && (!isDev || demoScreen === 'live'),
    canRemain: canRemainPostVisit,
  });

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
      <AppShell onMore={handleOpenMore}>
        <DemoScreenRenderer
          demoScreen={demoScreen}
          onSelectScreen={setDemoScreen}
          onRequestClick={() => setDevOverlay('overlay-confirm-request')}
          onViewDetails={() => setDevOverlay('overlay-vehicle-details')}
        />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} client={client} />
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

  // Authoritative Route Resolution
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
      <AppShell onMore={handleOpenMore}>
        <ScreenExpired />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} client={client} />
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
      <AppShell onMore={handleOpenMore}>
        <ScreenNetworkUnavailable
          failureKind={isBootstrapTemporarilyUnavailable ? 'UNAVAILABLE' : failureKind}
          retryAfterSeconds={cooldownSeconds}
          onRetry={() =>
            void (isBootstrapTemporarilyUnavailable ? retryBootstrap() : refreshSession())
          }
        />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} client={client} />
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
      <AppShell onMore={handleOpenMore}>
        <GuestSessionLoading />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} client={client} />
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
      <AppShell onMore={handleOpenMore}>
        <ScreenExpired />
        <OverlayMoreMenu open={showMoreMenu} onClose={handleCloseMore} client={client} />
      </AppShell>
    );
  }

  if (
    postVisit.selection && client
  ) {
    return (
      <GuestPostVisitRoute client={client} session={session} surface={postVisit.selection.surface}
        onBack={postVisit.back} onAuthorized={postVisit.authorized}
        onCloseMore={handleCloseMore} onMore={handleOpenMore}
        showMoreMenu={showMoreMenu} />
    );
  }

  return (
    <AppShell onMore={handleOpenMore}>
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
        onViewReceipt={() => postVisit.open('payment')}
        onRateExperience={() => postVisit.open('rating')}
      />

      {/* Production Overlays */}
      <GuestLiveOverlays
        client={client}
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
