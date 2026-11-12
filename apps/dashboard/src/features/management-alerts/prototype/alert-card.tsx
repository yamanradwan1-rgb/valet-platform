import { AlertCircle, Clock3, ShieldAlert } from "lucide-react";

import { uxCopy } from "./ux-copy";
import type { DemoRole, Locale, SyntheticAlert } from "./types";
import { SyntheticDestinationStatus } from "./synthetic-destination-preview";

interface Props {
  item: SyntheticAlert;
  locale: Locale;
  role: DemoRole;
  seen: Set<string>;
  pendingId: string | null;
  seenFailure: string | null;
  onSeen: (alert: SyntheticAlert) => void;
}

function eventTime(time: string | null, locale: Locale, fallback: string) {
  if (time === null) return fallback;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Amman",
  }).format(new Date(time));
}

export function AlertCard({
  item, locale, role, seen, pendingId, seenFailure, onSeen,
}: Props) {
  const t = uxCopy[locale];
  const isOccurrence = item.kind === "OCCURRENCE";
  const isSeen = seen.has(item.id);
  const pending = pendingId === item.id;
  const alertContent = (
    <span className="alert-card-text">
      <strong>{item.title[locale]}</strong>
      <span className="alert-description">{item.description[locale]}</span>
    </span>
  );

  return (
    <li
      className={`alert-card alert-card--${item.severity.toLowerCase()}`}
      data-category={item.category}
      data-kind={item.kind}
      data-alert-id={item.id}
      key={item.id}
    >
      <div className="alert-card-top">
        <span className={`severity-chip severity-chip--${item.severity.toLowerCase()}`}>
          {item.severity === "CRITICAL" ? <ShieldAlert size={12} /> : <AlertCircle size={12} />}
          {item.severity === "CRITICAL" ? t.critical : t.important}
        </span>
        <span className="alert-kind">{isOccurrence ? t.event : t.current}</span>
      </div>
      {item.destination.state === "available" ? (
        <a
          className="alert-card-content synthetic-destination-link"
          href={`#${item.destination.targetId}`}
          aria-label={`${item.title[locale]}. ${t.viewSyntheticDestination} ${item.destination.sourceId}. ${t.targetIdLabel} ${item.destination.targetId}`}
          style={{
            minInlineSize: "44px",
            minBlockSize: "44px",
            color: "inherit",
            textDecoration: "underline",
            textUnderlineOffset: "0.15em",
          }}
          data-testid="synthetic-destination-link"
          data-destination-state="available"
          data-source-id={item.destination.sourceId}
          data-target-id={item.destination.targetId}
        >
          {alertContent}
        </a>
      ) : (
        <div className="alert-card-content">{alertContent}</div>
      )}
      <SyntheticDestinationStatus destination={item.destination} locale={locale} />
      <div className="alert-card-bottom">
        {item.time ? (
          <time className="alert-meta" dateTime={item.time}>
            <Clock3 size={12} aria-hidden="true" />
            {eventTime(item.time, locale, t.noTimestamp)}
          </time>
        ) : (
          <span className="alert-meta">
            <Clock3 size={12} aria-hidden="true" />
            {eventTime(null, locale, t.noTimestamp)}
          </span>
        )}
        {item.location ? <span className="alert-meta alert-location"><bdi>{item.location[locale]}</bdi></span> : null}
      </div>
      {isOccurrence ? (
        <div className="alert-card-actions">
          {role === "location-manager" && item.category === "ALT-13" ? (
            <span className="seen-unavailable" role="status">{t.seenDenied}</span>
          ) : (
            <button
              type="button"
              className="seen-action"
              disabled={isSeen || pending || pendingId !== null}
              onClick={() => onSeen(item)}
            >
              {pending ? t.pending : isSeen ? t.markedSeen : t.markSeen}
            </button>
          )}
          {seenFailure === item.id ? <span className="seen-error" role="alert">{t.markFailure}</span> : null}
        </div>
      ) : null}
    </li>
  );
}
