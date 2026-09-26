"use client";

import { useEffect, useRef, type ReactNode } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const lastDialogFocus = new WeakMap<HTMLElement, HTMLElement>();

export function FocusDialog({
  children,
  label,
  onClose,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    if (!node) return;
    const parentDialog =
      node.parentElement?.closest<HTMLElement>('[role="dialog"]');
    if (parentDialog && !parentDialog.contains(returnFocusRef.current)) {
      returnFocusRef.current =
        lastDialogFocus.get(parentDialog) ?? parentDialog;
    }
    const isTopDialog = () =>
      Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
      ).at(-1) === node;
    const focusFirst = () => {
      if (!isTopDialog()) return;
      const first = node.querySelector<HTMLElement>(focusableSelector);
      (first ?? node).focus();
    };
    focusFirst();
    // MFA controls arrive after the authoritative state read.
    const observer = new MutationObserver(() => {
      if (document.activeElement === node) focusFirst();
    });
    observer.observe(node, { childList: true, subtree: true });
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('[role="dialog"]') === node
      ) {
        lastDialogFocus.set(node, target);
      }
    };
    node.addEventListener("focusin", rememberFocus);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((item) => item.closest('[role="dialog"]') === node);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      node.removeEventListener("focusin", rememberFocus);
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        aria-label={label}
        aria-modal="true"
        className="dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
