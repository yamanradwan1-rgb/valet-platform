import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';

export function ScreenVerifying() {
  const { t } = useTranslation();

  return (
    <div
      className="screen-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 32,
        paddingRight: 32,
        minHeight: '60vh',
        gap: 20,
      }}
    >
      <div
        className="spin"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `2px solid ${C.border}`,
          borderTopColor: C.blue,
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <p
          className="font-display"
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: C.navy,
            margin: 0,
          }}
        >
          {t('verifying.title')}
        </p>
        <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0, color: C.grey }}>
          {t('verifying.subtitle')}
        </p>
      </div>
    </div>
  );
}
