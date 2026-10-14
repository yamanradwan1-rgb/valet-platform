"use client";

import { Eye } from "lucide-react";
import type { ManagementAuditEvent } from "@valet/contracts";

import type { AuditCopy } from "./audit-copy";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { auditEventLabel } from "./audit-event-copy";
import {
  auditScopeLabel,
  formatAuditTime,
  type AuditTimeContext,
} from "./audit-presentation";
import { auditActorLabel, auditEntityLabel } from "./audit-event-labels";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import styles from "./audit.module.css";

export function AuditTable(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly items: readonly ManagementAuditEvent[];
  readonly next: () => void;
  readonly previous: () => void;
  readonly select: (event: ManagementAuditEvent) => void;
  readonly t: AuditCopy;
  readonly context: AuditTimeContext;
}) {
  const { t } = props;
  const { locale } = useDashboardLocale();
  return (
    <div className={`${styles.card} ${helpSlot.anchor}`}>
      <span className={helpSlot.tableCorner}><ScopedContextHelp helpKey="audit.table" /></span>
      <div
        aria-label={t.title}
        className={styles.tableWrap}
        role="region"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.timestampHeader}>
                {t.timestamp}
                <span className={styles.timezone}>
                  <bdi dir="ltr">{props.context.timezone}</bdi>
                </span>
              </th>
              <th>{t.actor}</th>
              <th>{t.action}</th>
              <th>{t.entity}</th>
              <th>{t.scope}</th>
              <th className={styles.actionCell}>{t.inspect}</th>
            </tr>
          </thead>
          <tbody>
            {props.items.length === 0 ? (
              <tr>
                <td colSpan={6}>{t.empty}</td>
              </tr>
            ) : (
              props.items.map((event, index) => {
                const actor = auditActorLabel(event, locale);
                return (
                  <tr key={event.eventId}>
                    <td>
                      <time dateTime={event.occurredAt}>
                        {formatAuditTime(
                          event.occurredAt,
                          props.context.timezone,
                          locale,
                        )}
                      </time>
                    </td>
                    <td>{actor?.label ?? t.noActor}</td>
                    <td className={styles.eventLabel}>
                      {auditEventLabel(event.eventType, locale)}
                    </td>
                    <td>{auditEntityLabel(event, locale)}</td>
                    <td>
                      <bdi>{auditScopeLabel(event, props.context, locale)}</bdi>
                    </td>
                    <td className={styles.actionCell}>
                      <button
                        aria-label={`${t.inspectEvent} ${index + 1}: ${auditEventLabel(event.eventType, locale)}`}
                        className={styles.inspect}
                        onClick={() => props.select(event)}
                        type="button"
                      >
                        <Eye aria-hidden="true" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <span>{t.loaded} {props.items.length} {t.events}</span>
        <div className={styles.buttons}>
          <button
            className={styles.secondary}
            disabled={!props.canPrevious}
            onClick={props.previous}
            type="button"
          >
            {t.previous}
          </button>
          <button
            className={styles.secondary}
            disabled={!props.canNext}
            onClick={props.next}
            type="button"
          >
            {t.next}
          </button>
        </div>
      </div>
    </div>
  );
}
