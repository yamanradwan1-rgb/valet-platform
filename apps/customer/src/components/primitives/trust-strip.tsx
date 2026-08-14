import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import { IcShieldCheck } from '../icons/status-icons';

export function TrustStrip() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        padding: '12px 16px',
        backgroundColor: C.iceSemantic,
      }}
    >
      <div style={{ color: C.accent, display: 'flex', flexShrink: 0 }}>
        <IcShieldCheck />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {t('trust.title')}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: C.textSecondary }}>
          {t('trust.sub')}
        </div>
      </div>
    </div>
  );
}
