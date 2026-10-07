import React from 'react';

import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import type { GuestContextConflictScope } from './guest-auth-context';

export function OverlayGuestContextConflict({
  open,
  scope,
  isSwitching,
  isSwitchOutcomeAmbiguous,
  onContinueCurrent,
  onOpenNew,
}: {
  readonly open: boolean;
  readonly scope: GuestContextConflictScope;
  readonly isSwitching: boolean;
  readonly isSwitchOutcomeAmbiguous: boolean;
  readonly onContinueCurrent: () => void;
  readonly onOpenNew: () => void;
}) {
  const { t } = useTranslation();
  const handleClose = () => {
    if (!isSwitching && !isSwitchOutcomeAmbiguous) onContinueCurrent();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={t('contextConflict.title')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <p style={{ fontSize: 14, color: C.textSecondary, margin: 0 }}>
          {t(
            scope === 'POST_VISIT'
              ? 'contextConflict.postVisitBody'
              : 'contextConflict.activeBody',
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <Btn
            onClick={onContinueCurrent}
            disabled={isSwitching || isSwitchOutcomeAmbiguous}
          >
            {t('contextConflict.continueCurrent')}
          </Btn>
          <Btn
            onClick={onOpenNew}
            variant="secondary"
            loading={isSwitching}
            disabled={isSwitching}
          >
            {t('contextConflict.openNew')}
          </Btn>
        </div>
      </div>
    </BottomSheet>
  );
}
