import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { IcShieldCheck } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function ScreenPaymentComplimentary({
  onViewReceipt,
  onDone,
}: {
  readonly onViewReceipt?: () => void;
  readonly onDone?: () => void;
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
        gap: 20,
      }}
    >
      <div
        style={{
          backgroundColor: C.warningSurface,
          padding: '8px 12px',
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 12, color: C.warningText, fontWeight: 500 }}>
          {t('payment.previewBanner')}
        </span>
      </div>

      <SectionTitle>{t('paymentComplimentary.title')}</SectionTitle>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.iceSemantic,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ color: C.trustAccent, display: 'flex', flexShrink: 0 }}>
          <IcShieldCheck />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {t('paymentComplimentary.badge')}
          </div>
          <div style={{ fontSize: 13, marginTop: 2, color: C.textSecondary }}>
            {t('paymentComplimentary.notice')}
          </div>
        </div>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.iceSemantic,
        }}
      >
        <InfoRow
          label={t('paymentComplimentary.valetFee')}
          value="$25.00"
          valueDirection="ltr"
        />
        <InfoRow
          label={t('paymentComplimentary.venueValidation')}
          value="-$25.00"
          valueDirection="ltr"
        />
        <div
          style={{
            borderTop: `1px solid ${C.borderSemantic}`,
            margin: '8px 0',
          }}
        />
        <InfoRow
          label={t('paymentComplimentary.amountDue')}
          value="$0.00"
          highlight
          valueDirection="ltr"
        />
      </div>

      {onViewReceipt && (
        <Btn variant="primary" onClick={onViewReceipt}>
          {t('paymentComplimentary.viewReceipt')}
        </Btn>
      )}

      {onDone && (
        <Btn variant="secondary" onClick={onDone}>
          {t('common.done')}
        </Btn>
      )}
    </div>
  );
}
