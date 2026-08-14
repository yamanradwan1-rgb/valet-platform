import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { StatusBadge } from '../../components/primitives/status-badge';
import { IcShieldCheck } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function ScreenReportSubmitted({
  onDone,
  reference = 'PREVIEW-1042',
}: {
  readonly onDone?: () => void;
  readonly reference?: string | undefined;
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
      <div style={{ backgroundColor: C.warningSurface, padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: C.warningText, fontWeight: 500 }}>
          {t('issueSubmitted.previewBanner')}
        </span>
      </div>

      <StatusBadge status="success" label={t('issueSubmitted.badge')} />

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
        <SectionTitle>{t('issueSubmitted.title')}</SectionTitle>
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.iceSemantic,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textSecondary, margin: 0 }}>
          {t('issueSubmitted.referenceLabel')}
        </p>
        <p
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            letterSpacing: '0.08em',
            marginTop: 8,
            marginBottom: 8,
          }}
        >
          {reference}
        </p>
        <p style={{ fontSize: 13, color: C.textSecondary, margin: 0, lineHeight: 1.5 }}>
          {t('issueSubmitted.message')}
        </p>
      </div>

      {onDone && (
        <Btn variant="primary" onClick={onDone}>
          {t('issueSubmitted.doneButton')}
        </Btn>
      )}
    </div>
  );
}
