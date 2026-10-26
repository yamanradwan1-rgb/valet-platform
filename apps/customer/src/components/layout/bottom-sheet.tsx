import React, { useEffect, useId, useRef } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { useGuestBrandStyle } from '../../features/session/use-guest-brand-style';
import { C } from '../../lib/theme/colors';
import { IcX } from '../icons/action-icons';

// A second sheet must never let an older sheet steal Escape/Tab or restore
// focus behind the active modal. This stack is presentation-only, not state.
const activeSheets: HTMLElement[] = [];

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
  const brandStyle = useGuestBrandStyle();
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const sheet = sheetRef.current;
    if (!sheet) return;
    activeSheets.push(sheet);
    const focusable = () => Array.from(sheet?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    (focusable()[0] ?? sheet).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeSheets[activeSheets.length - 1] !== sheet) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        sheet?.focus();
        return;
      }
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      if (!sheet.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = activeSheets.lastIndexOf(sheet);
      if (index >= 0) activeSheets.splice(index, 1);
      const previous = previousFocusRef.current;
      if (previous?.isConnected &&
          (!activeSheets.length || activeSheets[activeSheets.length - 1]!.contains(previous))) {
        previous.focus();
      } else {
        const active = activeSheets[activeSheets.length - 1];
        (active?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? active)?.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fade-in"
      onClick={onClose}
      style={{
        ...brandStyle,
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: C.overlay,
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? t('common.appName') : undefined}
        tabIndex={-1}
        className="sheet-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
          backgroundColor: C.sheetBg,
          borderTop: C.sheetBorder,
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
              backgroundColor: C.borderSemantic,
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
              id={titleId}
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: C.text,
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
                minWidth: 44,
                minHeight: 44,
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'none',
                border: 'none',
                color: C.textSecondary,
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
