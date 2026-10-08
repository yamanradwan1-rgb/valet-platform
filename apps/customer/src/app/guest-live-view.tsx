import React from 'react';

import { ScreenParked } from '../features/session/screen-parked';
import { ScreenReceived } from '../features/session/screen-received';
import { ScreenOnTheWay } from '../features/session/screen-on-the-way';
import { ScreenReady } from '../features/session/screen-ready';
import { ScreenCompleted } from '../features/session/screen-completed';
import { ScreenRequested } from '../features/retrieval/screen-requested';
import { ScreenReadyPIN } from '../features/handoff/screen-ready-pin';
import { ScreenReadyQR } from '../features/handoff/screen-ready-qr';
import type { GuestScreenId } from '../features/session/guest-lifecycle-router';
import type { GuestSafeSession } from '../lib/api/guest-api-types';
import type { useRetrieval } from '../features/retrieval/use-retrieval';
import type { useHandoff } from '../features/handoff/use-handoff';

export function GuestLiveView({
  screenId,
  session,
  retrieval,
  handoff,
  onRefreshSession,
  onRequestVehicle,
  onViewDetails,
  onViewReceipt,
  onRateExperience,
  canMutate = true,
  isRefreshing = false,
}: {
  readonly screenId: GuestScreenId;
  readonly session: GuestSafeSession;
  readonly retrieval: ReturnType<typeof useRetrieval>;
  readonly handoff: ReturnType<typeof useHandoff>;
  readonly onRefreshSession: () => void;
  readonly onRequestVehicle: () => void;
  readonly onViewDetails: () => void;
  readonly onViewReceipt?: (() => void) | undefined;
  readonly onRateExperience?: (() => void) | undefined;
  readonly canMutate?: boolean;
  readonly isRefreshing?: boolean;
}) {
  switch (screenId) {
    case 'RECEIVED':
      return <ScreenReceived session={session} onRefresh={onRefreshSession} isRefreshing={isRefreshing} />;

    case 'PARKED':
      return (
        <ScreenParked
          session={session}
          onRequestClick={onRequestVehicle}
          onViewDetails={onViewDetails}
          canRequest={canMutate}
        />
      );

    case 'REQUESTED':
      return (
        <ScreenRequested
          session={session}
          onCancel={() => void retrieval.cancelRetrieval()}
          isCancelling={retrieval.isCancelling}
          canCancel={canMutate}
          error={retrieval.actionError}
        />
      );

    case 'RETRIEVING':
      return <ScreenOnTheWay session={session} />;

    case 'READY':
      return <ScreenReady session={session} />;

    case 'HANDOFF_PENDING_PIN':
      return (
        <ScreenReadyPIN
          session={session}
          pickupCode={
            canMutate && handoff.material?.method === 'PICKUP_CODE'
              ? handoff.material.pickupCode
              : undefined
          }
          secondsRemaining={handoff.secondsRemaining}
          onSwitchToQR={canMutate ? () => void handoff.switchMethod('DYNAMIC_QR') : undefined}
          onRotate={canMutate ? () => void handoff.rotateCurrent() : undefined}
          isRotating={handoff.isRotating}
          error={handoff.error}
        />
      );

    case 'HANDOFF_PENDING_QR':
      return (
        <ScreenReadyQR
          session={session}
          qrPayload={
            canMutate && handoff.material?.method === 'DYNAMIC_QR'
              ? handoff.material.qrPayload
              : undefined
          }
          secondsRemaining={handoff.secondsRemaining}
          onSwitchToPIN={canMutate ? () => void handoff.switchMethod('PICKUP_CODE') : undefined}
          onRotate={canMutate ? () => void handoff.rotateCurrent() : undefined}
          isRotating={handoff.isRotating}
          error={handoff.error}
        />
      );

    case 'COMPLETED':
      return (
        <ScreenCompleted
          session={session}
          onViewReceipt={onViewReceipt}
          onRateExperience={onRateExperience}
        />
      );

    default:
      return null;
  }
}
