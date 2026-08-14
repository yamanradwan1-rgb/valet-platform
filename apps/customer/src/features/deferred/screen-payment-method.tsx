import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { C } from '../../lib/theme/colors';

type PaymentMethodId = 'apple_pay' | 'google_pay' | 'card' | 'venue';

export function ScreenPaymentMethod({
  onPaySuccess,
  amount = '25.00',
}: {
  readonly onPaySuccess: () => void;
  readonly amount?: string | undefined;
}) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('apple_pay');

  const methods: readonly { id: PaymentMethodId; label: string }[] = [
    { id: 'apple_pay', label: t('paymentMethod.applePay') },
    { id: 'google_pay', label: t('paymentMethod.googlePay') },
    { id: 'card', label: t('paymentMethod.card') },
    { id: 'venue', label: t('paymentMethod.venue') },
  ];

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
      <div style={{ backgroundColor: C.warningSurface, padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: C.warningText, fontWeight: 500 }}>
          {t('payment.previewBanner')}
        </span>
      </div>

      <div>
        <SectionTitle>{t('paymentMethod.title')}</SectionTitle>
        <p style={{ fontSize: 14, color: C.textSecondary, marginTop: 4, marginBottom: 0 }}>
          {t('paymentMethod.subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {methods.map((method) => {
          const isSelected = selectedMethod === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setSelectedMethod(method.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderRadius: 12,
                border: `2px solid ${isSelected ? C.selectedBorder : C.borderSemantic}`,
                backgroundColor: isSelected ? C.iceSemantic : C.surface,
                color: C.text,
                cursor: 'pointer',
                textAlign: 'start',
                transition: 'all 150ms ease',
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {method.label}
              </span>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${isSelected ? C.accent : C.borderSemantic}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? C.accent : 'transparent',
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Btn variant="primary" onClick={onPaySuccess}>
        {t('paymentMethod.payButton', { amount: `$${amount}` })}
      </Btn>
    </div>
  );
}
