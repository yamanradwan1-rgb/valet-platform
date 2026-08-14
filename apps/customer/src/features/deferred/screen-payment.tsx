import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { C } from '../../lib/theme/colors';

export function ScreenPaymentOverview({
  onAddTip,
  onPay,
}: {
  readonly onAddTip: () => void;
  readonly onPay: () => void;
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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          {t('payment.previewBanner')}
        </span>
      </div>

      <SectionTitle>{t('payment.overviewTitle')}</SectionTitle>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <InfoRow label={t('payment.serviceLabel')} value={t('payment.complimentary')} />
        <InfoRow label={t('payment.tipLabel')} value={t('payment.notAdded')} />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
        <InfoRow label={t('payment.estimatedTotal')} value="0.00" highlight />
      </div>

      <Btn variant="secondary" onClick={onAddTip}>
        {t('payment.previewAddTip')}
      </Btn>

      <Btn variant="primary" onClick={onPay}>
        {t('payment.previewReceipt')}
      </Btn>
    </div>
  );
}

export function ScreenAddTip({
  onContinue,
}: {
  readonly onContinue: () => void;
}) {
  const { t } = useTranslation();
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          {t('payment.tipBanner')}
        </span>
      </div>

      <SectionTitle>{t('payment.addTipTitle')}</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[1, 2, 5].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setSelectedTip(amount)}
            style={{
              padding: '16px 0',
              borderRadius: 12,
              border: `2px solid ${selectedTip === amount ? C.navy : C.border}`,
              backgroundColor: selectedTip === amount ? C.ice : '#FFFFFF',
              fontWeight: 600,
              fontSize: 16,
              color: C.navy,
              cursor: 'pointer',
            }}
          >
            +{amount}
          </button>
        ))}
      </div>

      <Btn variant="primary" onClick={onContinue}>
        {t('common.done')}
      </Btn>
    </div>
  );
}

export function ScreenReceipt({
  onDone,
}: {
  readonly onDone: () => void;
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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          {t('payment.receiptBanner')}
        </span>
      </div>

      <SectionTitle>{t('payment.receiptTitle')}</SectionTitle>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <InfoRow label={t('payment.service')} value={t('payment.standardValet')} />
        <InfoRow label={t('payment.status')} value={t('payment.complimentary')} />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
        <InfoRow label={t('payment.total')} value="0.00" highlight />
      </div>

      <Btn variant="primary" onClick={onDone}>
        {t('common.back')}
      </Btn>
    </div>
  );
}
