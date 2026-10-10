"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { contextHelpFor, type ContextHelpKey } from "./context-help-registry";
import styles from "./context-help.module.css";

// A no-state sibling signal: a newly opened help dismisses any other help in
// the same document. This does not manage FocusDialog or unrelated modals.
const otherHelpOpenedEvent = "vaylet-context-help-open";

export interface ContextHelpProps {
  readonly helpKey: ContextHelpKey;
  readonly locale: DashboardLocale;
  /**
   * Identity of the authorized owning surface, changed on route, organization,
   * location, auth/session generation, entitlement or authority transitions.
   * This is a lifecycle fence, not a client-side authorization check.
   */
  readonly scopeIdentity: string;
  /** Connected page heading to focus if a route transition detaches the trigger. */
  readonly returnFocusFallbackRef?: RefObject<HTMLElement | null> | undefined;
}

function restoreDetachedHelpFocus(fallbackRef?: RefObject<HTMLElement | null>) {
  if (document.activeElement !== document.body) return;
  // If another modal is now topmost, keep focus there instead of sending the
  // user behind it to a page heading.
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  );
  const topDialog = Array.from(dialogs).at(-1);
  if (topDialog) {
    // FocusDialog's Tab trap wraps from its first/last *control*, not from
    // the dialog container. Restoring the container would let Shift+Tab escape.
    const focusable = topDialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = Array.from(focusable).find(
      (element) => element.closest('[role="dialog"]') === topDialog,
    );
    (first ?? topDialog).focus();
    return;
  }
  const fallback = fallbackRef?.current;
  if (fallback?.isConnected) fallback.focus();
}

function ContextHelpInstance({
  helpKey,
  locale,
  returnFocusFallbackRef,
}: Omit<ContextHelpProps, "scopeIdentity">) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const identityRef = useRef({});
  const copy = contextHelpFor(helpKey, locale);
  const isArabic = locale === "ar";

  useEffect(() => {
    const identity = identityRef.current;
    const dismissIfOtherHelpOpened = (event: Event) => {
      if ((event as CustomEvent<object>).detail !== identity) setOpen(false);
    };
    document.addEventListener(otherHelpOpenedEvent, dismissIfOtherHelpOpened);
    return () => document.removeEventListener(otherHelpOpenedEvent, dismissIfOtherHelpOpened);
  }, []);

  useEffect(() => {
    const trigger = triggerRef.current;
    const fallbackRef = returnFocusFallbackRef;
    return () => {
      // FocusDialog restores focus on normal close. Only a detached trigger
      // needs a fallback after the old-dialog cleanup has finished.
      queueMicrotask(() => {
        if (trigger?.isConnected) return;
        restoreDetachedHelpFocus(fallbackRef);
      });
    };
  }, [returnFocusFallbackRef]);

  return (
    <>
      <button
        aria-label={(isArabic ? "مساعدة: " : "Help: ") + copy.title}
        className={styles.trigger}
        onClick={() => {
          document.dispatchEvent(new CustomEvent(otherHelpOpenedEvent, {
            detail: identityRef.current,
          }));
          setOpen(true);
        }}
        ref={triggerRef}
        title={(isArabic ? "مساعدة: " : "Help: ") + copy.title}
        type="button"
      >
        <HelpCircle aria-hidden="true" focusable="false" size={16} />
      </button>
      {open ? (
        <div className={styles.dialogHost} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
          <FocusDialog label={copy.title} onClose={() => setOpen(false)}>
            <div className={styles.content} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
              <h2 className={styles.title}>{copy.title}</h2>
              <p className={styles.body}>{copy.body}</p>
              <div className={styles.actions}>
                <button
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  {isArabic ? "إغلاق" : "Close"}
                </button>
              </div>
            </div>
          </FocusDialog>
        </div>
      ) : null}
    </>
  );
}

/**
 * Keying the state owner closes stale help synchronously on an identity
 * change, without relying on a later effect or global role lookup.
 */
export function ContextHelp({
  helpKey,
  locale,
  scopeIdentity,
  returnFocusFallbackRef,
}: ContextHelpProps) {
  return (
    <ContextHelpInstance
      helpKey={helpKey}
      key={JSON.stringify([scopeIdentity, helpKey])}
      locale={locale}
      returnFocusFallbackRef={returnFocusFallbackRef}
    />
  );
}
