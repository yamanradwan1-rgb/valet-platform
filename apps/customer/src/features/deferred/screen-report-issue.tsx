import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { SectionTitle, Label } from '../../components/primitives/typography-primitives';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { C } from '../../lib/theme/colors';

type IssueCategory = 'condition' | 'payment' | 'handoff' | 'service' | 'other';

export function ScreenReportIssue({
  session,
  onSubmit,
}: {
  readonly session?: GuestSafeSession | undefined;
  readonly onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<IssueCategory>('condition');
  const [description, setDescription] = useState<string>('');
  const [hasPhoto, setHasPhoto] = useState<boolean>(false);

  const categories: { id: IssueCategory; label: string }[] = [
    { id: 'condition', label: t('reportIssue.catCondition') },
    { id: 'payment', label: t('reportIssue.catPayment') },
    { id: 'handoff', label: t('reportIssue.catHandoff') },
    { id: 'service', label: t('reportIssue.catService') },
    { id: 'other', label: t('reportIssue.catOther') },
  ];

  const vehicleName = session?.vehicle
    ? `${session.vehicle.make ?? t('vehicle.defaultMake')} ${session.vehicle.model ?? ''}`.trim()
    : t('vehicle.defaultMake');

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
      <div>
        <SectionTitle>{t('reportIssue.title')}</SectionTitle>
        <p style={{ fontSize: 14, color: C.textSecondary, marginTop: 4, marginBottom: 0 }}>
          {t('reportIssue.subtitle')}
        </p>
      </div>

      <div
        style={{
          borderRadius: 12,
          padding: '12px 16px',
          backgroundColor: C.iceSemantic,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: C.textSecondary }}>
          {t('vehicle.yourVehicle')}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {vehicleName}
        </span>
      </div>

      <div>
        <Label>{t('reportIssue.categoryLabel')}</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {categories.map((cat) => {
            const isSelected = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1.5px solid ${isSelected ? C.selectedBorder : C.borderSemantic}`,
                  backgroundColor: isSelected ? C.accentSurface : C.surface,
                  color: C.text,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>{t('reportIssue.descriptionLabel')}</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('reportIssue.descriptionPlaceholder')}
          rows={4}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${C.borderSemantic}`,
            backgroundColor: C.surface,
            color: C.text,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      <div>
        <Label>{t('reportIssue.photoLabel')}</Label>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setHasPhoto(!hasPhoto)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: `1px dashed ${C.borderSemantic}`,
              backgroundColor: hasPhoto ? C.accentSurface : 'transparent',
              color: hasPhoto ? C.accent : C.textSecondary,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center',
            }}
          >
            {hasPhoto ? t('reportIssue.photoAdded') : t('reportIssue.addPhoto')}
          </button>
        </div>
      </div>

      <Btn variant="primary" onClick={onSubmit}>
        {t('reportIssue.submitButton')}
      </Btn>
    </div>
  );
}
