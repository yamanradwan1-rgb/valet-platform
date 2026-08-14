import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { IcAlert } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function ScreenPaymentError({
  onRetry,
  onChangeMethod,
}: {
  readonly onRetry?: () => void;
  readonly onChangeMethod?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '65vh',
        gap: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: C.dangerSurface,
          color: C.dangerSemantic,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: 'scale(1.3)', display: 'flex' }}>
          <IcAlert />
        </div>
      </div>

      <div>
        <SectionTitle>{t('paymentError.title')}</SectionTitle>
        <p style={{ fontSize: 14, color: C.textSecondary, marginTop: 8, marginBottom: 0, maxWidth: 300 }}>
          {t('paymentError.subtitle')}
        </p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {onRetry && (
          <Btn variant="primary" onClick={onRetry}>
            {t('paymentError.tryAgain')}
          </Btn>
        )}

        {onChangeMethod && (
          <Btn variant="secondary" onClick={onChangeMethod}>
            {t('paymentError.changeMethod')}
          </Btn>
        )}
      </div>
    </div>
  );
}
