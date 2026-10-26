import React, { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { useTheme } from '../../theme/use-theme';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import {
  IcChevronRight,
  IcLanguage,
  IcMoon,
  IcPhone,
  IcPrivacy,
} from '../../components/icons/action-icons';
import { C } from '../../lib/theme/colors';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { OverlayGuestInformationSheet, type GuestInformationSection } from './overlay-guest-information-sheet';

export function OverlayMoreMenu({
  open,
  onClose,
  client,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly client?: GuestApiClient | null;
}) {
  const { t, isRtl, toggleLocale } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  const [informationSection, setInformationSection] = useState<GuestInformationSection | null>(null);
  const privacyTrigger = useRef<HTMLButtonElement>(null);
  const contactTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<GuestInformationSection | null>(null);
  useEffect(() => {
    if (!open || informationSection || !returnFocus.current) return;
    const trigger = returnFocus.current === 'privacy' ? privacyTrigger : contactTrigger;
    returnFocus.current = null;
    trigger.current?.focus();
  }, [open, informationSection]);
  const closeMenu = () => {
    returnFocus.current = null;
    setInformationSection(null);
    onClose();
  };
  const closeInformation = () => {
    returnFocus.current = informationSection;
    setInformationSection(null);
  };

  const menuItems = [
    {
      Icon: IcLanguage,
      triggerRef: undefined,
      label: t('menu.languageLabel'),
      sub: t('menu.languageSub'),
      action: () => {
        toggleLocale();
        closeMenu();
      },
    },
    {
      Icon: IcPrivacy,
      triggerRef: privacyTrigger,
      label: t('menu.privacyLabel'),
      sub: t('menu.privacySub'),
      action: () => setInformationSection('privacy'),
    },
    {
      Icon: IcPhone,
      triggerRef: contactTrigger,
      label: t('menu.contactLabel'),
      sub: t('menu.contactSub'),
      action: () => setInformationSection('contact'),
    },
  ];

  return (
    <>
    <BottomSheet open={open && !informationSection} onClose={closeMenu} title={t('menu.title')}>
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
              backgroundColor: isDark ? C.primary : C.borderSemantic,
              boxShadow: isDark ? 'inset 0 0 0 1px var(--brand-boundary, transparent)' : undefined,
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
                backgroundColor: isDark ? C.onPrimary : '#FFFFFF',
                position: 'absolute',
                top: 3,
                left: isDark ? (isRtl ? 3 : 23) : (isRtl ? 23 : 3),
                transition: 'left 200ms ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </div>
        </button>

        {menuItems.map(({ Icon, label, sub, action, triggerRef }) => (
          <button
            key={label}
            ref={triggerRef}
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
    {open && informationSection && (
      <OverlayGuestInformationSheet
        section={informationSection}
        client={client}
        onClose={closeInformation}
      />
    )}
    </>
  );
}
