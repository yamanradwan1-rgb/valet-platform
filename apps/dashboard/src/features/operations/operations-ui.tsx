"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { operationsCopy } from "./operations-copy";
import styles from "./operations.module.css";

const focusable = [
  "button:not([disabled])", "a[href]", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export function OperationsPage(props: {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly compact?: boolean;
  readonly help?: ReactNode;
  readonly pairedHelp?: boolean;
  readonly referenceHeader?: boolean;
  readonly subtitleMargin?: "full" | "half";
  readonly subtitle: string;
  readonly title: string;
}) {
  const pageClass = [styles.page, props.compact ? styles.pageCompact : ""].filter(Boolean).join(" ");
  const subtitleClass = [styles.subtitle, props.subtitleMargin === "half" ? styles.subtitleHalf : ""].filter(Boolean).join(" ");
  const headerClass = [styles.header, props.referenceHeader ? styles.referenceHeader : ""].filter(Boolean).join(" ");
  return (
    <div className={pageClass} data-testid="md03-page">
      <div className={headerClass}>
        <div className={props.help ? [styles.helpHeading, props.pairedHelp ? styles.pairedHelp : ""].filter(Boolean).join(" ") : undefined}>
          {props.help ? (
            <div><h1 className={styles.title}>{props.title}</h1><p className={subtitleClass}>{props.subtitle}</p></div>
          ) : (
            <><h1 className={styles.title}>{props.title}</h1><p className={subtitleClass}>{props.subtitle}</p></>
          )}
          {props.help ? <span className={styles.pageHelpAnchor}>{props.help}</span> : null}
        </div>
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

export function ReadState(props: {
  readonly children: ReactNode;
  readonly empty?: boolean;
  readonly emptyText?: string;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly onRetry: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  if (props.loading) return <div className={`${styles.card} ${styles.state}`}>{t.loading}</div>;
  if (props.error) return <div className={styles.error} role="alert"><span>{props.error.message}</span><button className={styles.secondary} onClick={props.onRetry} type="button">{t.retry}</button></div>;
  if (props.empty) return <div className={`${styles.card} ${styles.state}`}>{props.emptyText ?? t.noData}</div>;
  return <>{props.children}</>;
}

export function CursorControls(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return (
    <div className={styles.pagination}>
      <button className={styles.secondary} disabled={!props.canPrevious} onClick={props.onPrevious} type="button">{t.previous}</button>
      <button className={styles.secondary} disabled={!props.canNext} onClick={props.onNext} type="button">{t.next}</button>
    </div>
  );
}

export function ReferenceCursorControls(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly label: string;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly size: "keys" | "incidents";
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const buttonClass = props.size === "keys" ? styles.cursorSquare32 : styles.cursorSquare28;
  const footerClass = props.size === "keys" ? styles.paginationKeys : styles.paginationIncidents;
  return (
    <div className={footerClass}>
      <span>{props.label}</span>
      <div className={styles.cursorButtons}>
        <button aria-label={t.previous} className={buttonClass} disabled={!props.canPrevious} onClick={props.onPrevious} type="button"><ChevronLeft size={16} /></button>
        <button aria-label={t.next} className={buttonClass} disabled={!props.canNext} onClick={props.onNext} type="button"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

export function StatusBadge(props: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const tone = props.tone ?? "neutral";
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{props.children}</span>;
}

export function DetailAction(props: { readonly label: string; readonly onClick: () => void }) {
  return <button aria-label={props.label} className={styles.detailAction} onClick={props.onClick} type="button"><MoreHorizontal aria-hidden="true" size={19} /></button>;
}

export function OperationsDrawer(props: {
  readonly children: ReactNode;
  readonly help?: ReactNode;
  readonly label: string;
  readonly onClose: () => void;
  readonly subtitle?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const { onClose } = props;
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Preserve the drawer's existing initial Close focus after adding a help control.
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const topDialog = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).at(-1);
      if (topDialog !== node) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(focusable));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); returnFocus.current?.focus(); };
  }, [onClose]);
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        event.preventDefault();
        onClose();
      }}
      role="presentation"
    >
      <div aria-label={props.label} aria-modal="true" className={styles.drawer} onMouseDown={(event) => event.stopPropagation()} ref={ref} role="dialog">
        <div className={styles.drawerHeader}>
          <div><h2>{props.label}</h2>{props.subtitle ? <div className={styles.drawerSubtitle}>{props.subtitle}</div> : null}</div>
          {props.help}
          <button aria-label={t.close} className={styles.quiet} onClick={onClose} ref={closeRef} type="button"><X size={18} /></button>
        </div>
        <div className={styles.drawerBody}>{props.children}</div>
      </div>
    </div>
  );
}

export function FactList({ children }: { readonly children: ReactNode }) {
  return <div className={styles.factList}>{children}</div>;
}

export function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value}</strong></div>;
}

export { styles };
