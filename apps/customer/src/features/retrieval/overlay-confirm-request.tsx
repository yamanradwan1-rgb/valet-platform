import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { IcClock } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function OverlayConfirmRequest({
  open,
  onConfirm,
  onClose,
  isLoading = false,
  error,
  canConfirm = true,
}: {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly canConfirm?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('confirmRequest.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <p style={{ fontSize: 14, color: C.textSecondary, margin: 0 }}>
          {t('confirmRequest.description')}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: C.iceSemantic,
          }}
        >
          <div style={{ color: C.accent, display: 'flex' }}>
            <IcClock />
          </div>
          <div>
            <span style={{ fontSize: 12, color: C.textSecondary }}>{t('confirmRequest.queueLabel')}</span>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>
              {t('confirmRequest.queueStatus')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          {error && (
            <p role="alert" style={{ color: C.dangerSemantic, fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
          <Btn onClick={onConfirm} loading={isLoading} disabled={isLoading || !canConfirm}>
            {t('confirmRequest.confirmButton')}
          </Btn>
          <Btn onClick={onClose} variant="ghost" disabled={isLoading}>
            {t('confirmRequest.cancelButton')}
          </Btn>
        </div>
      </div>
    </BottomSheet>
  );
}
