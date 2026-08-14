import React from 'react';

import { formatSessionState } from '../../i18n/format-session-state';
import { useTranslation } from '../../i18n/use-translation';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';

export function OverlayVehicleDetails({
  open,
  onClose,
  session,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly session: GuestSafeSession | null;
}) {
  const { t } = useTranslation();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('vehicle.detailsTitle')}>
      <div style={{ paddingTop: 8 }}>
        <InfoRow
          label={t('vehicle.make')}
          value={session?.vehicle.make ?? t('vehicle.unknown')}
        />
        <InfoRow
          label={t('vehicle.model')}
          value={session?.vehicle.model ?? t('vehicle.unknown')}
        />
        <InfoRow
          label={t('vehicle.color')}
          value={session?.vehicle.color ?? t('vehicle.notSpecified')}
        />
        <InfoRow
          label={t('vehicle.status')}
          value={formatSessionState(session?.state, t)}
          showBorder={false}
        />
      </div>
      <div style={{ paddingTop: 16 }}>
        <Btn onClick={onClose} variant="secondary">
          {t('common.close')}
        </Btn>
      </div>
    </BottomSheet>
  );
}
