import type { DemoEvent, InvestigationDemoLocale, InvestigationDemoQuery } from "../../investigation-demo-types";
import { investigationEventLabel, investigationLocalTime, investigationPosition } from "./investigation-live-projection";
import { copy } from "./investigation-workspace-copy";
import styles from "../../investigation-workspace.module.css";
export function TimelineEvent({
  event,
  matched,
  query,
  locale,
  onEvent,
}: {
  readonly event: DemoEvent;
  readonly matched: boolean;
  readonly query: InvestigationDemoQuery;
  readonly locale: InvestigationDemoLocale;
  readonly onEvent: (event: DemoEvent) => void;
}) {
  const c = copy[locale];
  const pos = investigationPosition(event, query);
  const kind = matched ? "match" : pos === "inWindow" ? "context" : "outside";
  const contextLabel = matched ? c.match : pos === "inWindow" ? c.inWindow : pos === "before" ? c.before : pos === "after" ? c.after : c.noWindow;
  return (
    <li className={styles.timelineRow} data-kind={kind}>
      <time className={styles.timestamp} dateTime={event.occurredAt ?? `2026-10-23T${event.time}:00+03:00`}
        title={event.occurredAt ? investigationLocalTime(event.occurredAt, true, event.locationTimezone) + " " + event.locationTimezone : undefined} dir="ltr">
        {event.occurredAt ? investigationLocalTime(event.occurredAt, false, event.locationTimezone) : event.time + ":00"}
      </time>
      <span className={styles.track} aria-hidden="true"><span /></span>
      <button className={styles.eventCard} type="button" onClick={() => onEvent(event)}
        aria-label={`${c.eventDetails}: ${event.id}, ${investigationEventLabel(event, locale)}`}>
        <span className={styles.eventTop}>
          <span className={styles.sourceBadge} data-source={event.source === "KEY_CUSTODY" ? "KEY" : event.source}>{c[event.source === "KEY_CUSTODY" ? "KEY" : event.source]}</span>
          <span className={styles.windowLabel} data-kind={kind}>{contextLabel}</span>
        </span>
        <strong className={styles.eventTitle}>{investigationEventLabel(event, locale)}</strong>
        <span className={styles.eventMeta}>
          <span>{event.actor ?? c.actorUnknown}</span>
          <span aria-hidden="true">·</span>
          <bdi dir="ltr">{event.id}</bdi>
          {event.resource && <bdi dir="ltr">{event.resource}</bdi>}
          {event.origin === "LIVE" && event.quality && event.quality !== "RECORDED" && (
            <span>{event.quality === "PARTIAL"
              ? locale === "ar" ? "أدلة جزئية" : "Partial evidence"
              : locale === "ar" ? "غير قابل للتحقق" : "Unverifiable"}</span>
          )}
        </span>
        {event.source === "INCIDENT" && (
          <span className={styles.incidentEvidence}>
            {locale === "ar"
              ? event.origin === "LIVE"
                ? [event.incidentType ?? "نوع غير متاح", event.severity ?? "خطورة غير متاحة", event.incidentStatus ?? "حالة غير متاحة"].join(" · ")
                : "تصنيف بلاغ KEY_MISSING غير مثبت؛ الخطورة HIGH والحالة الحالية OPEN. الوصف والصور غير متاحة أو مقيدة، ولا توجد تسوية مسجلة."
              : event.origin === "LIVE"
                ? [event.incidentType ?? "Type unavailable", event.severity ?? "Severity unavailable", event.incidentStatus ?? "Status unavailable"].join(" · ")
                : event.transition + " · " + event.evidence}
          </span>
        )}
      </button>
    </li>
  );
}
