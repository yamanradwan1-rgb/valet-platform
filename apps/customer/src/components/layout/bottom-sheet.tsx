import React from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import { IcX } from '../icons/action-icons';

export function BottomSheet({
  open,
  onClose,
  children,
  title,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly title?: string;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fade-in"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: 'rgba(7, 17, 31, 0.5)',
      }}
    >
      <div
        className="sheet-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
          backgroundColor: C.warm,
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: C.border,
            }}
          />
        </div>

        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 12,
              paddingBottom: 12,
            }}
          >
            <h3
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: C.navy,
                margin: 0,
              }}
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'none',
                border: 'none',
                color: C.grey,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <IcX size={18} />
            </button>
          </div>
        )}

        <div style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 16 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
