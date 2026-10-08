import React from 'react';

import { AppShell } from '../components/layout/app-shell';
import type { CustomerTab } from '../components/layout/bottom-nav';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import {
  GuestPostVisitScreen,
  type GuestPostVisitSurface,
} from '../features/post-visit/guest-post-visit-screen';
import type { GuestApiClient } from '../lib/api/guest-api-client';
import type { GuestSafeSession } from '../lib/api/guest-api-types';

export type { GuestPostVisitSurface };
export interface GuestPostVisitSelection {
  readonly surface: GuestPostVisitSurface;
  readonly visitId: string;
}

export function GuestPostVisitRoute({
  client,
  session,
  surface,
  tab,
  onBack,
  onCloseMore,
  onMore,
  onTab,
  showMoreMenu,
}: {
  readonly client: GuestApiClient;
  readonly session: GuestSafeSession;
  readonly surface: GuestPostVisitSurface;
  readonly tab: CustomerTab;
  readonly onBack: () => void;
  readonly onCloseMore: () => void;
  readonly onMore: () => void;
  readonly onTab: (tab: CustomerTab) => void;
  readonly showMoreMenu: boolean;
}) {
  return (
    <AppShell tab={tab} onTab={onTab} onMore={onMore} showNav={false}>
      <GuestPostVisitScreen client={client} session={session} surface={surface} onBack={onBack} />
      <OverlayMoreMenu open={showMoreMenu} onClose={onCloseMore} />
    </AppShell>
  );
}
