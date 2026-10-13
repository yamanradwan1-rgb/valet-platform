"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ManagementAuditEvent } from "@valet/contracts";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { auditCopy } from "./audit-copy";
import { AuditDetailRenderer } from "./audit-detail-renderer";
import { auditActorLabel, auditEntityLabel } from "./audit-event-labels";
import { auditEventLabel } from "./audit-event-copy";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import {
  auditScopeLabel,
  formatAuditTime,
  type AuditTimeContext,
} from "./audit-presentation";
import styles from "./audit-drawer.module.css";

const focusable = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AuditDetailDrawer(props: {
  readonly event: ManagementAuditEvent;
  readonly onClose: () => void;
  readonly context: AuditTimeContext;
}) {
  const { locale } = useDashboardLocale();
  const t = auditCopy(locale);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { onClose } = props;
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      // A portaled nested Help dialog owns Escape and Tab while it is topmost.
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
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      returnFocus.current?.focus();
    };
  }, [onClose]);

  const actor = auditActorLabel(props.event, locale);
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        event.preventDefault();
        onClose();
      }}
      role="presentation"
    >
      <div
        aria-label={t.details}
        aria-modal="true"
        className={styles.drawer}
        onMouseDown={(event) => event.stopPropagation()}
        ref={ref}
        role="dialog"
      >
        <div className={styles.drawerHeader}>
          <div>
            <h2>{auditEventLabel(props.event.eventType, locale)}</h2>
            <bdi className={styles.muted} dir="ltr">
              {props.event.eventType}
            </bdi>
          </div>
          <div className={helpSlot.row}>
            <ScopedContextHelp helpKey="audit.detail" />
            <button
              aria-label={t.close}
              className={styles.quiet}
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.detailSection}>
            <div className={styles.fact}>
              <span>{t.eventId}</span>
              <strong>
                <bdi dir="ltr">{props.event.eventId}</bdi>
              </strong>
            </div>
            <div className={styles.fact}>
              <span>{t.occurredAt}</span>
              <strong>
                {formatAuditTime(
                  props.event.occurredAt,
                  props.context.timezone,
                  locale,
                )}{" "}
                <bdi dir="ltr">({props.context.timezone})</bdi>
              </strong>
            </div>
            <div className={styles.fact}>
              <span>{t.scope}</span>
              <strong>
                <bdi>{auditScopeLabel(props.event, props.context, locale)}</bdi>
              </strong>
            </div>
            {props.event.scope.kind === "LOCATION" ? (
              <div className={styles.fact}>
                <span>{t.locationId}</span>
                <strong>
                  <bdi dir="ltr">{props.event.scope.locationId}</bdi>
                </strong>
              </div>
            ) : null}
          </div>
          <div className={styles.detailSection}>
            {actor ? (
              <div className={styles.fact}>
                <span>{t.actor}</span>
                <strong>{actor.label}</strong>
              </div>
            ) : (
              <p className={styles.safeEmpty}>{t.noActor}</p>
            )}
            {actor?.id ? (
              <div className={styles.fact}>
                <span>{t.membershipId}</span>
                <strong>
                  <bdi dir="ltr">{actor.id}</bdi>
                </strong>
              </div>
            ) : null}
            <div className={styles.fact}>
              <span>{t.entity}</span>
              <strong>{auditEntityLabel(props.event, locale)}</strong>
            </div>
            {props.event.entity ? (
              <div className={styles.fact}>
                <span>{t.entityId}</span>
                <strong>
                  <bdi dir="ltr">{props.event.entity.id}</bdi>
                </strong>
              </div>
            ) : null}
          </div>
          <AuditDetailRenderer event={props.event} />
        </div>
      </div>
    </div>
  );
}
