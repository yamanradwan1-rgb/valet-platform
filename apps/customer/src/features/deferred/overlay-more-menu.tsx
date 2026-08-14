import React from 'react';

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
  onOpenArabicPreview,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOpenArabicPreview?: (() => void) | undefined;
}) {
  const menuItems = [
    {
      Icon: IcLanguage,
      label: 'عربي (Preview)',
      sub: 'Arabic RTL interface preview',
      action: () => {
        onClose();
        onOpenArabicPreview?.();
      },
    },
    {
      Icon: IcCamera,
      label: 'Vehicle condition photos',
      sub: 'Check-in photos preview',
      action: onClose,
    },
    {
      Icon: IcPrivacy,
      label: 'Privacy & Terms',
      sub: 'Data protection policies',
      action: onClose,
    },
    {
      Icon: IcPhone,
      label: 'Call valet desk',
      sub: 'Direct operator contact',
      action: onClose,
    },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="More options">
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
              textAlign: 'left',
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
            <div style={{ color: C.grey }}>
              <IcChevronRight />
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
