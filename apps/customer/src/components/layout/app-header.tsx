import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import { VayletLogo } from '../brand/vaylet-logo';
import { IcArrowLeft, IcMore } from '../icons/action-icons';

export function AppHeader({
  onMore,
  onBack,
  title,
  whiteLabel = false,
  dark,
}: {
  readonly onMore: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly whiteLabel?: boolean | undefined;
  readonly dark?: boolean | undefined;
}) {
  const { t, isRtl } = useTranslation();

  const headerBg = dark === true ? C.brandNavy : dark === false ? C.warm : C.bg;
  const textColor = dark === true ? '#FFFFFF' : C.text;
  const iconColor = dark === true ? 'rgba(255,255,255,0.7)' : C.textSecondary;
  const borderBottom = dark === true ? 'none' : `1px solid ${C.borderSemantic}`;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 16,
        backgroundColor: headerBg,
        borderBottom,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('header.backAria')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'none',
              border: 'none',
              color: textColor,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <div style={{ display: 'flex', transform: isRtl ? 'scaleX(-1)' : undefined }}>
              <IcArrowLeft />
            </div>
          </button>
        )}
        {!onBack && (
          <div>
            <VayletLogo dark={dark} height={24} />
            {whiteLabel && (
              <div
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: dark === true ? 'rgba(255,255,255,0.5)' : C.textMuted,
                }}
              >
                {t('common.poweredBy')}
              </div>
            )}
          </div>
        )}
        {title && (
          <span
            style={{
              fontWeight: 600,
              fontSize: 17,
              color: textColor,
            }}
          >
            {title}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onMore}
        aria-label={t('header.moreAria')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 44,
          minHeight: 44,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'none',
          border: 'none',
          color: iconColor,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <IcMore />
      </button>
    </header>
  );
}
