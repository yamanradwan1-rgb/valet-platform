'use client';

import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';

export interface GuestVehicleReadyAlertPresentationProps {
  readonly body: string;
  readonly direction: 'ltr' | 'rtl';
  readonly dismissLabel: string;
  readonly onDismiss: () => void;
  readonly title: string;
}

export function GuestVehicleReadyAlertPresentation({
  body,
  direction,
  dismissLabel,
  onDismiss,
  title,
}: GuestVehicleReadyAlertPresentationProps) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      dir={direction}
      role="status"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.successSemantic}`,
        borderRadius: 16,
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.18)',
        left: '50%',
        maxWidth: 390,
        padding: '14px 16px',
        position: 'fixed',
        top: 76,
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        zIndex: 100,
      }}
    >
      <div style={{ alignItems: 'flex-start', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong style={{ color: C.text, display: 'block', fontSize: 15 }}>
            {title}
          </strong>
          <span style={{ color: C.textSecondary, display: 'block', fontSize: 13, marginTop: 3 }}>
            {body}
          </span>
        </div>
        <button
          aria-label={dismissLabel}
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 0,
            color: C.textSecondary,
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function GuestVehicleReadyAlert({
  onDismiss,
}: {
  readonly onDismiss: () => void;
}) {
  const { direction, t } = useTranslation();
  return (
    <GuestVehicleReadyAlertPresentation
      body={t('readyAlert.body')}
      direction={direction}
      dismissLabel={t('common.close')}
      onDismiss={onDismiss}
      title={t('readyAlert.title')}
    />
  );
}
