"use client";

import { Eye } from "lucide-react";
import type { ManagementAuditEvent } from "@valet/contracts";

import type { AuditCopy } from "./audit-copy";
import { auditActorLabel, auditEntityLabel } from "./audit-event-labels";
import styles from "./audit.module.css";

export function AuditTable(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly items: readonly ManagementAuditEvent[];
  readonly next: () => void;
  readonly previous: () => void;
  readonly select: (event: ManagementAuditEvent) => void;
  readonly t: AuditCopy;
}) {
  const { t } = props;
  return (
    <div className={styles.card}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t.timestamp}</th>
              <th>{t.actor}</th>
              <th>{t.action}</th>
              <th>{t.entity}</th>
              <th>{t.scope}</th>
              <th className={styles.actionCell}>{t.inspect}</th>
            </tr>
          </thead>
          <tbody>
            {props.items.length === 0 ? (
              <tr><td colSpan={6}>{t.empty}</td></tr>
            ) : props.items.map((event) => {
              const actor = auditActorLabel(event);
              return (
                <tr key={event.eventId}>
                  <td><bdi dir="ltr">{event.occurredAt}</bdi></td>
                  <td>
                    {actor ? <bdi dir="ltr">{actor.label}</bdi> : t.noActor}
                    {actor?.id ? <><br /><bdi className={styles.muted} dir="ltr">{actor.id}</bdi></> : null}
                  </td>
                  <td><bdi className={styles.eventCode} dir="ltr">{event.eventType}</bdi></td>
                  <td>
                    <bdi dir="ltr">{auditEntityLabel(event)}</bdi>
                    {event.entity ? <><br /><bdi className={styles.muted} dir="ltr">{event.entity.id}</bdi></> : null}
                  </td>
                  <td>
                    <bdi dir="ltr">{event.scope.kind}</bdi>
                    {event.scope.kind === "LOCATION"
                      ? <><br /><bdi className={styles.muted} dir="ltr">{event.scope.locationId}</bdi></>
                      : null}
                  </td>
                  <td className={styles.actionCell}>
                    <button
                      aria-label={t.inspect}
                      className={styles.inspect}
                      onClick={() => props.select(event)}
                      type="button"
                    >
                      <Eye aria-hidden="true" size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <span>{t.loaded} {props.items.length} {t.events}</span>
        <div className={styles.buttons}>
          <button className={styles.secondary} disabled={!props.canPrevious} onClick={props.previous} type="button">{t.previous}</button>
          <button className={styles.secondary} disabled={!props.canNext} onClick={props.next} type="button">{t.next}</button>
        </div>
      </div>
    </div>
  );
}
