'use client';

import React, { useEffect, useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { useTranslation } from '../../i18n/use-translation';
import { GuestPaymentSummary } from '../payment/guest-payment-summary';
import { GuestLiveRating } from '../rating/guest-live-rating';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';

export type GuestPostVisitSurface = 'payment' | 'rating';

export function GuestPostVisitScreen({
  client,
  session,
  surface,
  onBack,
  onAuthorized,
}: {
  readonly client: GuestApiClient;
  readonly session: GuestSafeSession;
  readonly surface: GuestPostVisitSurface;
  readonly onBack: () => void;
  readonly onAuthorized?: () => void;
}) {
  const { t } = useTranslation();
  const [authorization, setAuthorization] = useState<{
    readonly client: GuestApiClient;
    readonly visitId: string;
    readonly authorized: boolean;
  } | null>(null);
  const currentAuthorization = authorization?.client === client &&
    authorization.visitId === session.valetSessionId ? authorization : null;

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    void client.loadSession(abort.signal).then(
      (current) => {
        if (active) {
          setAuthorization({
            client,
            visitId: session.valetSessionId,
            authorized: current.valetSessionId === session.valetSessionId && current.state === 'COMPLETED',
          });
        }
      },
      () => {
        if (active && !abort.signal.aborted) {
          setAuthorization({ client, visitId: session.valetSessionId, authorized: false });
        }
      },
    );
    return () => {
      active = false;
      abort.abort();
    };
  }, [client, session.valetSessionId]);

  useEffect(() => {
    if (currentAuthorization?.authorized) onAuthorized?.();
  }, [currentAuthorization, onAuthorized]);

  if (currentAuthorization === null) return null;
  if (!currentAuthorization.authorized) {
    return (
      <div style={{ padding: '24px 20px 32px' }}>
        <Btn variant="secondary" onClick={onBack}>{t('common.back')}</Btn>
      </div>
    );
  }
  if (surface === 'payment') {
    return <GuestPaymentSummary client={client} session={session} onBack={onBack} />;
  }
  if (surface === 'rating') {
    return (
      <GuestLiveRating
        client={client}
        visitId={session.valetSessionId}
        canRate
        onBack={onBack}
      />
    );
  }
  return null;
}
