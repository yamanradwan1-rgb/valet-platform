import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { IcShieldCheck } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function ScreenPaymentSuccess({
  onViewReceipt,
  onDone,
  serviceAmount = '25.00',
  tipAmount = '5.00',
  totalAmount = '30.00',
}: {
  readonly onViewReceipt?: () => void;
  readonly onDone?: () => void;
  readonly serviceAmount?: string | undefined;
  readonly tipAmount?: string | undefined;
  readonly totalAmount?: string | undefined;
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
      <StatusBadge status="success" label={t('paymentSuccess.badge')} />

      <div style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 4 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: 'rgba(47, 155, 120, 0.15)',
            color: C.successSemantic,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ transform: 'scale(1.3)', display: 'flex' }}>
            <IcShieldCheck />
          </div>
        </div>
        <SectionTitle>{t('paymentSuccess.title')}</SectionTitle>
        <p style={{ fontSize: 14, color: C.textSecondary, marginTop: 6, marginBottom: 0 }}>
          {t('paymentSuccess.subtitle')}
        </p>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.iceSemantic,
        }}
      >
        <InfoRow label={t('paymentSuccess.serviceFee')} value={`$${serviceAmount}`} />
        <InfoRow label={t('paymentSuccess.tipFee')} value={`$${tipAmount}`} />
        <div style={{ borderTop: `1px solid ${C.borderSemantic}`, margin: '8px 0' }} />
        <InfoRow label={t('paymentSuccess.totalPaid')} value={`$${totalAmount}`} highlight />
      </div>

      <div
        style={{
          borderRadius: 12,
          padding: '12px 16px',
          backgroundColor: C.surface,
          border: `1px solid ${C.borderSemantic}`,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 13, color: C.textSecondary, margin: 0 }}>
          {t('paymentSuccess.receiptNotice')}
        </p>
      </div>

      {onViewReceipt && (
        <Btn variant="secondary" onClick={onViewReceipt}>
          {t('paymentSuccess.viewReceipt')}
        </Btn>
      )}

      {onDone && (
        <Btn variant="primary" onClick={onDone}>
          {t('paymentSuccess.returnValet')}
        </Btn>
      )}
    </div>
  );
}
