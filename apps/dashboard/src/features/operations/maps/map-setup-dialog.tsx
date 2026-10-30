"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { styles } from "../operations-ui";

const focusableSelector = [
  "button:not([disabled])", "a[href]", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export function MapSetupDialog(props: {
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly onClose: () => void;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  const onClose = props.onClose;
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>(focusableSelector)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(focusableSelector));
      if (items.length === 0) return;
      const first = items[0]!; const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); returnFocusRef.current?.focus(); };
  }, []);

  return <div className={styles.mapDialogBackdrop} onMouseDown={props.onClose} role="presentation">
    <div className={styles.mapDialogFrame}>
      <div aria-labelledby="map-setup-dialog-title" aria-modal="true" className={styles.mapDialog} onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog">
        <header className={styles.mapDialogHeader}>
          <div><h2 id="map-setup-dialog-title">{props.title}</h2>{props.subtitle ? <p>{props.subtitle}</p> : null}</div>
          <button aria-label={t.close} className={styles.mapDialogClose} onClick={props.onClose} type="button"><X size={20} /></button>
        </header>
        <div className={styles.mapDialogBody}>{props.children}</div>
        <footer className={styles.mapDialogFooter}>{props.footer}</footer>
      </div>
    </div>
  </div>;
}
