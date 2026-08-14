import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';

export function JourneyProgress({ step }: { readonly step: 0 | 1 | 2 }) {
  const { t } = useTranslation();
  const steps = [
    t('journey.requested'),
    t('journey.onTheWay'),
    t('journey.ready'),
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: i <= step ? C.blue : C.border,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                color: i <= step ? C.blue : C.muted,
              }}
            >
              {s}
            </span>
          </div>
          {i < 2 && (
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: i < step ? C.blue : C.border,
                marginLeft: 6,
                marginRight: 6,
                marginBottom: 16,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
