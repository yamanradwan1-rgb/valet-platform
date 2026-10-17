"use client";

import type {
  DemoEvent,
  DemoMatch,
  InvestigationDemoLocale,
  InvestigationDemoQuery,
} from "./investigation-demo-types";
import {
  investigationDisplayTime,
  investigationEventLabel,
  investigationKey,
  investigationLocalTime,
  investigationPosition,
} from "./investigation/timeline/investigation-live-projection";
import styles from "./investigation-workspace.module.css";

interface InvestigationWorkspaceProps {
  readonly locale: InvestigationDemoLocale;
  readonly matches: readonly DemoMatch[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onEvent: (event: DemoEvent) => void;
  readonly query: InvestigationDemoQuery | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly locationTimezone?: string;
}

const copy = {
  en: {
    results: "Matching Sessions",
    apply: "Apply the search filters to view matching Sessions.",
    noMatches: "No matching Sessions",
    adjust: "No recorded events meet the selected search criteria.",
    choose: "Select a Session to inspect its complete recorded timeline.",
    complete: "Completed",
    open: "Still open · summary",
    incident: "Incident OPEN · current",
    incidentRecorded: "Recorded incident · status not supplied",
    waiting: "Loading recorded events…",
    incomplete: "Recorded history unavailable; retry the authorized read.",
    noWindow: "Discovery window unavailable",
    historical: "Historical slot",
    currentSlot: "Current key slot",
    notAssigned: "Not assigned",
    notRecorded: "Not recorded",
    session: "Session",
    currentVehicle: "Current vehicle · Current label",
    currentPlate: "Current plate · Current label",
    matching: "In-window matches",
    firstLast: "First / last match",
    events: "Full available timeline",
    sources: "Full available event history, including earlier and later events. Chronological order alone does not establish causation.",
    coverage: "Audit · Key Custody · Dispatch · Incidents",
    match: "Matching witness",
    inWindow: "In window · context",
    before: "Before search window",
    after: "After search window",
    outside: "Outside search window",
    actorUnknown: "No recorded employee actor",
    incidentGap: "Historical custody transition unavailable",
    incidentGapText:
      "This is an evidence gap marker, not a recorded event. A reported KEY_MISSING classification does not prove loss; incident resolution and restricted photos are unavailable.",
    timezone: "Asia/Amman · UTC+03:00",
    eventDetails: "Inspect source event",
    witness: "in-window witness",
    witnesses: "in-window witnesses",
    KEY: "Key Custody",
    AUDIT: "Audit",
    DISPATCH: "Dispatch",
    INCIDENT: "Incident",
  },
  ar: {
    results: "الجلسات المطابقة",
    apply: "طبّق معايير البحث لإظهار الجلسات المطابقة.",
    noMatches: "لا توجد جلسات مطابقة",
    adjust: "لا توجد أحداث مسجلة تحقق معايير البحث المختارة.",
    choose: "اختر جلسة لعرض التسلسل الزمني المسجل كاملاً.",
    complete: "مكتملة",
    open: "ما تزال مفتوحة · ملخص",
    incident: "حادثة مفتوحة · حالياً",
    incidentRecorded: "بلاغ حادثة مسجل · الحالة غير متاحة",
    waiting: "جارٍ تحميل الأحداث المسجلة…",
    incomplete: "التاريخ المسجل غير متاح؛ أعِد المحاولة المصرّح بها.",
    noWindow: "فترة البحث غير متاحة",
    historical: "الخانة التاريخية",
    currentSlot: "خانة المفتاح الحالية",
    notAssigned: "غير مخصصة",
    notRecorded: "غير مسجّلة",
    session: "الجلسة",
    currentVehicle: "المركبة الحالية · وصف حالي",
    currentPlate: "اللوحة الحالية · وصف حالي",
    matching: "الأحداث المطابقة",
    firstLast: "أول / آخر تطابق",
    events: "الخط الزمني الكامل المتاح",
    sources: "يتضمن التاريخ المسجل أحداثًا قبل النافذة وبعدها؛ الترتيب الزمني لا يثبت السببية وحده.",
    coverage: "تدقيق · عهدة المفتاح · توزيع · حوادث",
    match: "دليل مطابق",
    inWindow: "ضمن الفترة · سياق",
    before: "قبل فترة البحث",
    after: "بعد فترة البحث",
    outside: "خارج فترة البحث",
    actorUnknown: "لا يوجد موظف منفّذ مسجّل",
    incidentGap: "انتقال الحيازة التاريخي غير متاح",
    incidentGapText:
      "هذه علامة لنقص الأدلة وليست حدثاً مسجلاً. تصنيف KEY_MISSING المبلّغ عنه لا يثبت ضياع المفتاح؛ لا تتوفر تسوية للحادثة أو الصور المقيّدة.",
    timezone: "عمّان · UTC+03:00",
    eventDetails: "فحص حدث المصدر",
    witness: "حدث شاهد ضمن الفترة",
    witnesses: "أحداث شاهدة ضمن الفترة",
    KEY: "عهدة المفتاح",
    AUDIT: "التدقيق",
    DISPATCH: "توزيع المهام",
    INCIDENT: "الحوادث",
  },
} as const;

function Status({ isDone, locale, currentState }: { readonly isDone: boolean; readonly locale: InvestigationDemoLocale; readonly currentState?: string | undefined }) {
  return (
    <span className={isDone ? styles.completed : styles.openStatus}>
      {currentState ? currentState.replaceAll("_", " ") + " · CURRENT" : isDone ? copy[locale].complete : copy[locale].open}
    </span>
  );
}

function SessionChoice({
  match,
  selected,
  locale,
  onSelect,
}: {
  readonly match: DemoMatch;
  readonly selected: boolean;
  readonly locale: InvestigationDemoLocale;
  readonly onSelect: (id: string) => void;
}) {
  const c = copy[locale];
  const session = match.session;
  return (
    <button
      type="button"
      className={styles.sessionChoice}
      aria-pressed={selected}
      onClick={() => onSelect(session.id)}
    >
      <span className={styles.choiceHeading}>
        <strong>{session.make} {session.model}</strong>
        <Status isDone={session.state === "COMPLETED"} locale={locale} currentState={session.origin === "LIVE" ? session.currentState : undefined} />
      </span>
      <span className={styles.choiceIds}>
        <bdi dir="ltr">{session.id}</bdi>
        <span aria-hidden="true">·</span>
        {session.plate ? <bdi dir="ltr">{session.plate}</bdi> : c.notRecorded}
      </span>
      <span className={styles.choiceMeta}>
        {session.origin !== "LIVE" && <span>{c.historical} <bdi dir="ltr">{session.slot}</bdi></span>}
        <span>{c.currentSlot}: {session.currentSlot ? <bdi dir="ltr">{session.currentSlot}</bdi> : c.notAssigned}</span>
        {session.incident && <span className={styles.incidentStatus}>{session.origin === "LIVE" ? c.incidentRecorded : c.incident}</span>}
      </span>
      <span className={styles.choiceCount}>
        <strong>{match.count}</strong> {match.count === 1 ? c.witness : c.witnesses}
      </span>
      <span className={styles.timeRange} dir="ltr">{investigationDisplayTime(match.first, match.origin === "LIVE", session.locationTimezone)} – {investigationDisplayTime(match.last, match.origin === "LIVE", session.locationTimezone)}</span>
    </button>
  );
}

function TimelineEvent({
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

export function InvestigationWorkspace({
  locale,
  matches,
  selectedId,
  onSelect,
  onEvent,
  query,
  loading = false,
  error = null,
  locationTimezone,
}: InvestigationWorkspaceProps) {
  const c = copy[locale];
  const current = matches.find((match) => match.session.id === selectedId);
  const selected = current?.session;
  const orderedEvents = selected ? [...selected.events].sort((a, b) => (a.occurredAt ?? a.time).localeCompare(b.occurredAt ?? b.time)) : [];
  const witnesses = new Set(current?.witnessIds ?? []);

  return (
    <section className={styles.workspace} aria-label={c.events}>
      <aside className={styles.results} aria-label={c.results}>
        <header className={styles.resultsHeader}>
          <div><h2>{c.results}</h2><small>{query ? `${query.date} · ${query.start}–${query.end} · ${locationTimezone ?? c.timezone}` : c.apply}</small></div>
          <span className={styles.count}>{query ? String(matches.length).padStart(2, "0") : "—"}</span>
        </header>
        {!query || !matches.length ? (
          <p className={styles.empty}>{error ?? (loading ? c.waiting : query ? `${c.noMatches}. ${c.adjust}` : c.apply)}</p>
        ) : (
          <div className={styles.choiceList}>
            {matches.map((match) => (
              <SessionChoice key={match.session.id} match={match}
                selected={match.session.id === selectedId} locale={locale} onSelect={onSelect} />
            ))}
          </div>
        )}
      </aside>
      <article className={styles.investigation} aria-label={c.events}>
        {!query || !matches.length || !selected || !current || (selected.origin === "LIVE" && !selected.timelineComplete) || loading || error ? (
          <p className={styles.empty}>{error ?? (loading ? c.waiting : selected?.origin === "LIVE" ? c.incomplete : !query ? c.apply : !matches.length ? c.adjust : c.choose)}</p>
        ) : (
          <>
            <header className={styles.sessionHeading}>
              <div>
                <span className={styles.eyebrow}>{c.session} / <bdi dir="ltr">{selected.id}</bdi></span>
                <h2>{selected.make} {selected.model}</h2>
                <p>{c.sources}</p>
              </div>
              <Status isDone={selected.state === "COMPLETED"} locale={locale} currentState={selected.origin === "LIVE" ? selected.currentState : undefined} />
            </header>
            <div className={styles.identities}>
              <div><span>{c.currentVehicle}</span><strong>{selected.make} {selected.model}</strong></div>
              <div><span>{c.currentPlate}</span><strong>{selected.plate ? <bdi dir="ltr">{selected.plate}</bdi> : c.notRecorded}</strong></div>
              <div><span>{c.currentSlot}</span><strong>{selected.currentSlot ? <bdi dir="ltr">{selected.currentSlot}</bdi> : c.notAssigned}</strong></div>
              <div><span>{c.firstLast}</span><strong dir="ltr">{investigationDisplayTime(current.first, current.origin === "LIVE", selected.locationTimezone)} – {investigationDisplayTime(current.last, current.origin === "LIVE", selected.locationTimezone)}</strong></div>
              <div><span>{c.matching}</span><strong>{current.count}</strong></div>
            </div>
            <div className={styles.timelineHeading}>
              <div><h3>{c.events} <span>({orderedEvents.length})</span></h3><small>{selected.origin === "LIVE" && selected.coverage ? Object.entries(selected.coverage).map(([source, value]) => source + ": " + value.status).join(" · ") : c.coverage}</small></div>
              <div className={styles.legend}><span data-kind="match">{c.match}</span><span data-kind="context">{c.inWindow}</span><span data-kind="outside">{c.outside}</span></div>
            </div>
            <ol className={styles.timeline}>
              {orderedEvents.map((event) => (
                <TimelineEvent key={investigationKey(event.source, event.id)} event={event} matched={witnesses.has(event.origin === "LIVE" ? investigationKey(event.source, event.id) : event.id)}
                  query={query} locale={locale} onEvent={onEvent} />
              ))}
            </ol>
            {selected.origin !== "LIVE" && selected.incident && (
              <aside className={styles.gap} aria-label={c.incidentGap}>
                <strong>{c.incidentGap}</strong>
                <p>{c.incidentGapText}</p>
              </aside>
            )}
          </>
        )}
      </article>
    </section>
  );
}
