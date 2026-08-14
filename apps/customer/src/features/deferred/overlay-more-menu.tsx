import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import {
  IcCamera,
  IcChevronRight,
  IcLanguage,
  IcPhone,
  IcPrivacy,
} from '../../components/icons/action-icons';
import { C } from '../../lib/theme/colors';

export function OverlayMoreMenu({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { t, isRtl, toggleLocale } = useTranslation();

  const menuItems = [
    {
      Icon: IcLanguage,
      label: t('menu.languageLabel'),
      sub: t('menu.languageSub'),
      action: () => {
        toggleLocale();
        onClose();
      },
    },
    {
      Icon: IcCamera,
      label: t('menu.photosLabel'),
      sub: t('menu.photosSub'),
      action: onClose,
    },
    {
      Icon: IcPrivacy,
      label: t('menu.privacyLabel'),
      sub: t('menu.privacySub'),
      action: onClose,
    },
    {
      Icon: IcPhone,
      label: t('menu.contactLabel'),
      sub: t('menu.contactSub'),
      action: onClose,
    },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title={t('menu.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        {menuItems.map(({ Icon, label, sub, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'start',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: C.blue, display: 'flex' }}>
                <Icon />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>{label}</div>
                <div style={{ fontSize: 12, color: C.grey }}>{sub}</div>
              </div>
            </div>
            <div style={{ color: C.grey, display: 'flex', transform: isRtl ? 'scaleX(-1)' : undefined }}>
              <IcChevronRight />
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
