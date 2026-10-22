import React, { useEffect } from 'react';
import { OverlayConfirmRequest } from '../features/retrieval/overlay-confirm-request';
import { OverlayVehicleDetails } from '../features/deferred/overlay-vehicle-details';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import type { GuestSafeSession } from '../lib/api/guest-api-types';
import type { GuestApiClient } from '../lib/api/guest-api-client';

export function GuestLiveOverlays({
  session, client, showConfirmRequest, showVehicleDetails, showMoreMenu,
  onCloseConfirm, onConfirm, onCloseDetails, onCloseMore,
  isRequesting, requestError, canRequest,
}: {
  readonly session: GuestSafeSession;
  readonly client: GuestApiClient | null;
  readonly showConfirmRequest: boolean;
  readonly showVehicleDetails: boolean;
  readonly showMoreMenu: boolean;
  readonly onCloseConfirm: () => void;
  readonly onConfirm: () => void;
  readonly onCloseDetails: () => void;
  readonly onCloseMore: () => void;
  readonly isRequesting: boolean;
  readonly requestError: string | null;
  readonly canRequest: boolean;
}) {
  // The dialog belongs to the PARKED lifecycle; authoritative state changes
  // dismiss it without allowing the old intent to run on a newer lifecycle.
  useEffect(() => {
    if (showConfirmRequest && session.state !== 'PARKED') {
      queueMicrotask(onCloseConfirm);
    }
  }, [showConfirmRequest, session.state, onCloseConfirm]);
  return (
    <>
      <OverlayConfirmRequest
        open={showConfirmRequest}
        onClose={onCloseConfirm}
        onConfirm={onConfirm}
        isLoading={isRequesting}
        error={requestError}
        canConfirm={canRequest}
      />
      <OverlayVehicleDetails open={showVehicleDetails} onClose={onCloseDetails} session={session} />
      <OverlayMoreMenu open={showMoreMenu} onClose={onCloseMore} client={client} />
    </>
  );
}
