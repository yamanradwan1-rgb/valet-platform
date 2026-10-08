'use client';

import React, { useEffect, useState } from 'react';
import type { GuestPaymentProjectionResponse } from '@valet/contracts';

import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { useTranslation } from '../../i18n/use-translation';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

type Payment = NonNullable<GuestPaymentProjectionResponse['payment']>;

function money(value: string, currency: string, locale: 'ar' | 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function dateTime(value: string, locale: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function methodKey(method: Payment['collectionMethod']) {
  return `paymentSummary.method.${method}` as const;
}

function statusKey(status: Payment['status']) {
  return `paymentSummary.status.${status}` as const;
}

export function GuestPaymentSummary({
  client,
  session,
  onBack,
}: {
  readonly client: GuestApiClient;
  readonly session: GuestSafeSession;
  readonly onBack: () => void;
}) {
  const { locale, t } = useTranslation();
  const [result, setResult] = useState<{
    readonly client: GuestApiClient;
    readonly visitId: string;
    readonly projection: GuestPaymentProjectionResponse | null;
    readonly failed: boolean;
  } | null>(null);
  const current = result?.client === client && result.visitId === session.valetSessionId
    ? result : null;
  const projection = current?.projection ?? null;
  const failed = current?.failed ?? false;

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    void client.loadPaymentProjection(session, abort.signal).then(
      (value) => {
        if (active) setResult({ client, visitId: session.valetSessionId, projection: value, failed: false });
      },
      () => {
        if (active && !abort.signal.aborted) {
          setResult({ client, visitId: session.valetSessionId, projection: null, failed: true });
        }
      },
    );
    return () => {
      active = false;
      abort.abort();
    };
  }, [client, session]);

  const payment = projection?.payment ?? null;
  const invalidMissingPayment = Boolean(
    projection && payment === null && projection.releaseRequiresPayment,
  );

  return (
    <div className="screen-enter" style={{ padding: '24px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionTitle>{t('paymentSummary.title')}</SectionTitle>

      {(failed || invalidMissingPayment) && (
        <p role="status" style={{ margin: 0, color: C.textSecondary, fontSize: 14 }}>
          {t('paymentSummary.loadFailed')}
        </p>
      )}

      {projection && payment === null && !projection.releaseRequiresPayment && (
        <p style={{ margin: 0, color: C.textSecondary, fontSize: 14 }}>
          {t('paymentSummary.noPaymentRequired')}
        </p>
      )}

      {payment && (
        <div style={{ borderRadius: 14, padding: 20, backgroundColor: C.iceSemantic }}>
          <InfoRow label={t('paymentSummary.service')} value={money(payment.serviceAmount, payment.currency, locale)} valueDirection="ltr" />
          <InfoRow label={t('paymentSummary.tip')} value={money(payment.tipAmount, payment.currency, locale)} valueDirection="ltr" />
          <InfoRow label={t('paymentSummary.amountDue')} value={money(payment.amountDue, payment.currency, locale)} valueDirection="ltr" />
          <InfoRow label={t('paymentSummary.amountPaid')} value={money(payment.amountPaid, payment.currency, locale)} valueDirection="ltr" />
          <InfoRow label={t('paymentSummary.method')} value={t(methodKey(payment.collectionMethod))} />
          {payment.paidAt && (
            <InfoRow label={t('paymentSummary.paidAt')} value={dateTime(payment.paidAt, locale)} valueDirection="ltr" />
          )}
          <InfoRow label={t('paymentSummary.status')} value={t(statusKey(payment.status))} showBorder={false} />
        </div>
      )}

      {payment && projection && projection.refunds.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', color: C.textSecondary, fontSize: 13, fontWeight: 600 }}>
            {t('paymentSummary.refunds')}
          </p>
          {projection.refunds.map((refund, index) => (
            <InfoRow
              key={`${refund.requestedAt}-${index}`}
              label={money(refund.amount, payment.currency, locale)}
              value={refund.status === 'SUCCEEDED' ? t('paymentSummary.refund.SUCCEEDED') : t(statusKey(refund.status))}
              valueDirection="ltr"
            />
          ))}
        </div>
      )}

      <Btn variant="secondary" onClick={onBack}>{t('common.back')}</Btn>
    </div>
  );
}
