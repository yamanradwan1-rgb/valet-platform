import React from 'react';

import { AppShell } from '../components/layout/app-shell';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import {
  GuestPostVisitScreen,
  type GuestPostVisitSurface,
} from '../features/post-visit/guest-post-visit-screen';
import type { GuestApiClient } from '../lib/api/guest-api-client';
import type { GuestSafeSession } from '../lib/api/guest-api-types';

export type { GuestPostVisitSurface };
export function GuestPostVisitRoute({
  client,
  session,
  surface,
  onBack,
  onAuthorized,
  onCloseMore,
  onMore,
  showMoreMenu,
}: {
  readonly client: GuestApiClient;
  readonly session: GuestSafeSession;
  readonly surface: GuestPostVisitSurface;
  readonly onBack: () => void;
  readonly onAuthorized: () => void;
  readonly onCloseMore: () => void;
  readonly onMore: () => void;
  readonly showMoreMenu: boolean;
}) {
  return (
    <AppShell onMore={onMore}>
      <GuestPostVisitScreen client={client} session={session} surface={surface} onBack={onBack}
        onAuthorized={onAuthorized} />
      <OverlayMoreMenu open={showMoreMenu} onClose={onCloseMore} client={client} />
    </AppShell>
  );
}
