import React, { useEffect, useState } from 'react';
import type { GuestInformationResponse } from '@valet/contracts';

import { BottomSheet } from '../../components/layout/bottom-sheet';
import { useTranslation } from '../../i18n/use-translation';
import type { Locale } from '../../i18n/locale';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { C } from '../../lib/theme/colors';
import { GuestInformationContent, type GuestInformationSection } from './guest-information-content';

export type { GuestInformationSection } from './guest-information-content';

type InformationState = {
  readonly client: GuestApiClient;
  readonly locale: Locale;
  readonly section: GuestInformationSection;
  readonly data?: GuestInformationResponse;
  readonly error?: boolean;
};

export function OverlayGuestInformationSheet({
  section, client, onClose,
}: {
  readonly section: GuestInformationSection;
  readonly client: GuestApiClient | null | undefined;
  readonly onClose: () => void;
}) {
  const { locale, t } = useTranslation();
  const [state, setState] = useState<InformationState | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    void client.loadInformation(locale, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ client, locale, section, data }); },
      () => { if (!controller.signal.aborted) setState({ client, locale, section, error: true }); },
    );
    return () => controller.abort();
  }, [section, client, locale, retry]);

  const current = state && state.client === client && state.locale === locale && state.section === section
    ? state : null;
  const error = !client || current?.error;

  return (
    <BottomSheet open onClose={onClose}
      title={t(section === 'privacy' ? 'menu.privacyLabel' : 'menu.contactLabel')}>
      {error ? (
        <div role="alert">
          <p style={{ color: C.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
            {t('information.loadFailed')}
          </p>
          {client && (
            <button type="button" onClick={() => { setState(null); setRetry((value) => value + 1); }}
              style={{ border: `1px solid ${C.borderSemantic}`, borderRadius: 10,
                padding: '12px 16px', background: C.surface, color: C.text, cursor: 'pointer' }}>
              {t('common.tryAgain')}
            </button>
          )}
        </div>
      ) : current?.data ? (
        <GuestInformationContent section={section} information={current.data} />
      ) : (
        <p role="status" aria-live="polite" style={{ color: C.textSecondary, fontSize: 14 }}>
          {t('information.loading')}
        </p>
      )}
    </BottomSheet>
  );
}
