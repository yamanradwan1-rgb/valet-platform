"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { administrationCopy } from "./administration-copy";
import { styles } from "./administration-ui";

const selector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AdministrationDrawer(props: {
  readonly children: ReactNode;
  readonly label: string;
  readonly onClose: () => void;
}) {
  const { onClose } = props;
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>(selector)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (
        Array.from(
          document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
        ).at(-1) !== node
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(selector),
      ).filter((item) => item.closest('[role="dialog"]') === node);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      returnFocus.current?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={props.onClose}
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
          <h2 className={styles.dialogTitle}>{props.label}</h2>
          <button
            aria-label={t.close}
            className={styles.quiet}
            onClick={props.onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
