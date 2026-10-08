import React from 'react';
import { Btn } from '../components/primitives/btn';
import { useTranslation } from '../i18n/use-translation';
import { C } from '../lib/theme/colors';

// UI-FROZEN SAFE DELTA: appears only while the existing live session is
// informational, and does not reflow the premium Guest layout.
export function GuestFreshnessNotice({
  visible, cooldownSeconds, isRefreshing, onRefresh,
}: {
  readonly visible: boolean;
  readonly cooldownSeconds: number;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
        insetInline: 12, zIndex: 110, marginInline: 'auto', maxWidth: 420,
        padding: 12, borderRadius: 12, backgroundColor: C.sheetBg,
        border: `1px solid ${C.borderSemantic}`, boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
        display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 8,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: C.textSecondary, textAlign: 'center' }}>
        {t('system.staleStatusNotice')}
      </p>
      {cooldownSeconds > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: C.textMuted, textAlign: 'center' }}>
          {t('system.cooldownNotice', { seconds: cooldownSeconds })}
        </p>
      )}
      <Btn variant="secondary" fullWidth={false} loading={isRefreshing}
        disabled={cooldownSeconds > 0 || isRefreshing} onClick={onRefresh}>
        {t('common.refresh')}
      </Btn>
    </div>
  );
}
