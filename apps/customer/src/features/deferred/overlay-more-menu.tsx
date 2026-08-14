import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { useTheme } from '../../theme/use-theme';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import {
  IcCamera,
  IcChevronRight,
  IcLanguage,
  IcMoon,
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
  const { isDark, toggleTheme } = useTheme();

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
        {/* Dark Mode Switch Row - Accessible single interactive button */}
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label={t('menu.darkModeAria')}
          onClick={toggleTheme}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 12,
            border: `1px solid ${C.borderSemantic}`,
            backgroundColor: 'transparent',
            cursor: 'pointer',
            textAlign: 'start',
            minHeight: 48,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color: C.accent, display: 'flex' }}>
              <IcMoon />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {t('menu.darkModeLabel')}
              </div>
              <div style={{ fontSize: 12, color: C.textSecondary }}>
                {t('menu.darkModeSub')}
              </div>
            </div>
          </div>

          {/* Non-interactive visual switch track and thumb */}
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: isDark ? C.accent : C.borderSemantic,
              position: 'relative',
              transition: 'background-color 200ms ease',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: '#FFFFFF',
                position: 'absolute',
                top: 3,
                left: isDark ? (isRtl ? 3 : 23) : (isRtl ? 23 : 3),
                transition: 'left 200ms ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </div>
        </button>

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
              border: `1px solid ${C.borderSemantic}`,
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'start',
              minHeight: 48,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: C.accent, display: 'flex' }}>
                <Icon />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
                <div style={{ fontSize: 12, color: C.textSecondary }}>{sub}</div>
              </div>
            </div>
            <div
              style={{
                color: C.textSecondary,
                display: 'flex',
                transform: isRtl ? 'scaleX(-1)' : undefined,
              }}
            >
              <IcChevronRight />
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
