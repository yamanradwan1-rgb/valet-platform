import React from 'react';

import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';

/** Requires an independently verified Location support fact before mounting. */
export function GuestOnsiteHelp({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="screen-enter" style={{ padding: '24px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionTitle>{t('help.onsiteTitle')}</SectionTitle>
      <p style={{ margin: 0, color: C.textSecondary, fontSize: 14 }}>
        {t('help.onsiteBody')}
      </p>
      <Btn variant="secondary" onClick={onBack}>{t('common.back')}</Btn>
    </div>
  );
}
