import React from 'react';

import { C } from '../../lib/theme/colors';
import { VayletLogo } from '../brand/vaylet-logo';
import { IcArrowLeft, IcMore } from '../icons/action-icons';

export function AppHeader({
  onMore,
  onBack,
  title,
  whiteLabel = false,
  dark = false,
}: {
  readonly onMore: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly whiteLabel?: boolean | undefined;
  readonly dark?: boolean | undefined;
}) {
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
        backgroundColor: dark ? C.navy : C.warm,
        borderBottom: dark ? 'none' : `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'none',
              border: 'none',
              color: dark ? '#FFFFFF' : C.navy,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <IcArrowLeft />
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
                  color: dark ? 'rgba(255,255,255,0.5)' : C.muted,
                }}
              >
                Powered by VAYLET
              </div>
            )}
          </div>
        )}
        {title && (
          <span
            style={{
              fontWeight: 600,
              fontSize: 17,
              color: dark ? '#FFFFFF' : C.navy,
            }}
          >
            {title}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onMore}
        aria-label="More options"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'none',
          border: 'none',
          color: dark ? 'rgba(255,255,255,0.7)' : C.grey,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <IcMore />
      </button>
    </header>
  );
}
