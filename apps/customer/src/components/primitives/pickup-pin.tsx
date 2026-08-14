import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import { Label } from './typography-primitives';

export function PickupPIN({
  code,
  expiresInSeconds,
  onRotate,
  isRotating = false,
}: {
  readonly code: string;
  readonly expiresInSeconds?: number | undefined;
  readonly onRotate?: (() => void) | undefined;
  readonly isRotating?: boolean | undefined;
}) {
  const { t } = useTranslation();
  const digits = code.split('');

  const formatExpiry = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = expiresInSeconds !== undefined && expiresInSeconds <= 0;

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: C.iceSemantic,
      }}
    >
      <div
        style={{
          padding: '16px 16px 8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Label>{t('handoffPin.pickupCodeLabel')}</Label>
        {expiresInSeconds !== undefined && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isExpired ? C.dangerSemantic : C.textSecondary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isExpired
              ? t('handoffPin.expired')
              : t('handoffPin.expiresIn', { time: formatExpiry(expiresInSeconds) })}
          </span>
        )}
      </div>

      <div
        dir="ltr"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(6px, 2.5vw, 12px)',
          paddingBottom: 16,
          paddingLeft: 12,
          paddingRight: 12,
          maxWidth: 280,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {digits.map((digit, i) => (
          <div
            key={i}
            className="font-display"
            style={{
              flex: 1,
              maxWidth: 56,
              minWidth: 40,
              height: 56,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: C.surface,
              fontSize: 'clamp(22px, 6vw, 32px)',
              fontWeight: 700,
              color: isExpired ? C.textMuted : C.text,
              border: `1px solid ${C.borderSemantic}`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {digit}
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '0 16px 16px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 14, color: C.textSecondary, margin: 0 }}>
          {t('handoffPin.showCodeSub')}
        </p>
        <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0, color: C.textMuted }}>
          {t('handoffPin.oneTime')}
        </p>

        {onRotate && (
          <button
            type="button"
            onClick={onRotate}
            disabled={isRotating}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              color: C.accent,
              fontSize: 13,
              fontWeight: 600,
              cursor: isRotating ? 'not-allowed' : 'pointer',
              opacity: isRotating ? 0.5 : 1,
              padding: '4px 8px',
            }}
          >
            {isRotating ? t('handoffPin.refreshing') : t('handoffPin.refreshButton')}
          </button>
        )}
      </div>
    </div>
  );
}
