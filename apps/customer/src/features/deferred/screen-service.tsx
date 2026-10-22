import React, { useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { C } from '../../lib/theme/colors';

export function ScreenRate({
  onDone,
}: {
  readonly onDone: () => void;
}) {
  const { t } = useTranslation();
  const [stars, setStars] = useState(5);

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
          {t('help.rateBanner')}
        </span>
      </div>

      <SectionTitle>{t('help.rateTitle')}</SectionTitle>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setStars(star)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 32,
              cursor: 'pointer',
              color: star <= stars ? '#F59E0B' : C.borderSemantic,
            }}
          >
            ★
          </button>
        ))}
      </div>

      <Btn variant="primary" onClick={onDone}>
        {t('common.done')}
      </Btn>
    </div>
  );
}
