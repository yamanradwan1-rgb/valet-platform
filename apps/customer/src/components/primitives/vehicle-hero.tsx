import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import { Label } from './typography-primitives';

export function VehicleHero({
  make,
  model = '',
  color = '',
  dim = false,
}: {
  readonly make?: string | null;
  readonly model?: string | null;
  readonly color?: string | null;
  readonly dim?: boolean;
}) {
  const { t } = useTranslation();
  const displayMake = make ?? t('vehicle.defaultMake');
  const displayModel = model ?? '';
  const displaySubtitle = color ? color : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        paddingBottom: 8,
        opacity: dim ? 0.6 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      <div>
        <Label>{t('vehicle.yourVehicle')}</Label>
        <div
          className="font-display"
          style={{
            marginTop: 4,
            fontSize: 32,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: C.navy,
          }}
        >
          {displayMake} {displayModel}
        </div>
        {displaySubtitle ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              color: C.grey,
              textTransform: 'capitalize',
            }}
          >
            {displaySubtitle}
          </div>
        ) : null}
      </div>
      <div
        style={{
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: C.ice,
          width: 56,
          height: 56,
          flexShrink: 0,
        }}
      >
        <span
          className="font-display"
          style={{
            fontWeight: 600,
            fontSize: 18,
            color: C.blue,
          }}
        >
          {displayModel ? displayModel.slice(0, 3).toUpperCase() : 'VAL'}
        </span>
      </div>
    </div>
  );
}
