import React from 'react';

import { GuestWebPushPermissionCard } from '../features/web-push/guest-web-push-permission-card';
import type { GuestSafeSession } from '../lib/api/guest-api-types';

export function GuestWebPushMount({
  enabled,
  session,
}: {
  readonly enabled: boolean;
  readonly session: GuestSafeSession;
}) {
  if (
    !enabled ||
    session.guestVehicleReadyNotificationEnabled !== true ||
    session.readyAt !== null
  ) {
    return null;
  }
  return <GuestWebPushPermissionCard />;
}
