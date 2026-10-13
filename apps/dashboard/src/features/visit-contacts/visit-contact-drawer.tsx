"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import baseStyles from "./visit-contacts.module.css";
import drawerStyles from "./visit-contact-drawer.module.css";
const styles = { ...baseStyles, ...drawerStyles };

const focusable = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function VisitContactDrawer(props: {
  readonly children: ReactNode;
  readonly closeLabel: string;
  readonly label: string;
  readonly onClose: () => void;
  readonly headerAction?: ReactNode;
  readonly subtitle?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { onClose } = props;
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Help is portaled above this drawer and manages its own keyboard trap.
      const topDialog = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).at(-1);
      if (topDialog !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(focusable));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocus.current?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        aria-label={props.label}
        aria-modal="true"
        className={styles.drawer}
        onMouseDown={(event) => event.stopPropagation()}
        ref={ref}
        role="dialog"
      >
        <div className={styles.drawerHeader}>
          <div>
            <h2>{props.label}</h2>
            {props.subtitle}
          </div>
          <div className={styles.headerActions}>
            {props.headerAction}
            <button
              aria-label={props.closeLabel}
              className={styles.quiet}
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <div className={styles.drawerBody}>{props.children}</div>
      </div>
    </div>
  );
}
