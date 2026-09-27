"use client";

import {
  managementAuditKnownEventTypes,
  type ManagementAuditKnownEvent,
} from "@valet/contracts";

import type { AuditCopy } from "./audit-copy";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { auditEventLabel } from "./audit-event-copy";
import styles from "./audit.module.css";

export function AuditFilters(props: {
  readonly eventType: ManagementAuditKnownEvent | null;
  readonly onEventType: (value: string) => void;
  readonly showEventType: boolean;
  readonly t: AuditCopy;
}) {
  const { locale } = useDashboardLocale();
  return (
    <div className={styles.filters}>
      {props.showEventType ? (
        <label className={styles.field}>
          <span className={styles.label}>{props.t.eventType}</span>
          <select
            className={styles.select}
            onChange={(event) => props.onEventType(event.target.value)}
            value={props.eventType ?? ""}
          >
            <option value="">{props.t.allEventTypes}</option>
            {managementAuditKnownEventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {auditEventLabel(eventType, locale)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className={styles.muted}>{props.t.locationScope}</span>
      )}
    </div>
  );
}
