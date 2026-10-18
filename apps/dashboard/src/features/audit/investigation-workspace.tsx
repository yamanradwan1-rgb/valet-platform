"use client";

import { useCallback, useRef } from "react";

import type {
  DemoEvent,
  DemoMatch,
  InvestigationDemoLocale,
  InvestigationDemoQuery,
} from "./investigation-demo-types";
import {
  investigationDisplayTime,
  investigationKey,
} from "./investigation/timeline/investigation-live-projection";
import type { InvestigationPageState } from "./investigation/live/investigation-pagination-state";
import { InvestigationContinuationControls } from "./investigation/investigation-continuation-controls";
import styles from "./investigation-workspace.module.css";
import { copy } from "./investigation/timeline/investigation-workspace-copy";
import { TimelineEvent } from "./investigation/timeline/investigation-timeline-event";

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
  readonly timelineLoading?: boolean;
  readonly timelineError?: string | null;
  readonly searchPage?: InvestigationPageState;
  readonly onSearchMore?: () => void;
  readonly onTimelineMore?: () => void;
}

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
  timelineLoading = false,
  timelineError = null,
  searchPage,
  onSearchMore,
  onTimelineMore,
}: InvestigationWorkspaceProps) {
  const c = copy[locale];
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const timelineHeading = useRef<HTMLHeadingElement>(null);
  const focusResults = useCallback(() => resultHeading.current?.focus({ preventScroll: true }), []);
  const focusTimeline = useCallback(() => timelineHeading.current?.focus({ preventScroll: true }), []);
  const current = matches.find((match) => match.session.id === selectedId);
  const selected = current?.session;
  const orderedEvents = selected ? selected.origin === "LIVE" ? [...selected.events]
    : [...selected.events].sort((a, b) => (a.occurredAt ?? a.time).localeCompare(b.occurredAt ?? b.time)) : [];
  const witnesses = new Set(current?.witnessIds ?? []);
  const coverage = query ? searchPage?.coverage : null;
  const coverageLimited = Boolean(coverage && (searchPage?.coverageVaries ||
    Object.values(coverage).some((source) => source.status !== "AVAILABLE" ||
      source.reason === "INTEGRITY_ANOMALY")));

  return (
    <section className={styles.workspace} aria-label={c.events}>
      <aside className={styles.results} aria-label={c.results}>
        <header className={styles.resultsHeader}>
          <div><h2 ref={resultHeading} tabIndex={-1}>{c.results}</h2><small>{query ? `${query.date} · ${query.start}–${query.end} · ${locationTimezone ?? c.timezone}` : c.apply}</small></div>
          <span className={styles.count} aria-label={query && searchPage ? `${locale === "ar" ? "تم تحميل" : "Loaded"} ${matches.length}` : undefined}>{query ? String(matches.length).padStart(2, "0") : "—"}</span>
        </header>
        {coverageLimited && coverage && (
          <div className={styles.empty} role="status" data-investigation-coverage="limited">
            <strong>{c.sourceCoverage}</strong>
            <p>{Object.entries(coverage).map(([source, value]) =>
              `${source}: ${value.status}${value.reason ? ` (${value.reason})` : ""}`).join(" · ")}</p>
            {searchPage?.coverageVaries && <p>{c.varyingCoverage}</p>}
          </div>
        )}
        {!query || !matches.length ? (
          <p className={styles.empty}>{error ?? (loading ? c.waiting : query
            ? coverageLimited ? c.noVerifiedMatches : `${c.noMatches}. ${c.adjust}` : c.apply)}</p>
        ) : (
          <div className={styles.choiceList} id="investigation-session-results">
            {matches.map((match) => (
              <SessionChoice key={match.session.id} match={match}
                selected={match.session.id === selectedId} locale={locale} onSelect={onSelect} />
            ))}
            {searchPage && onSearchMore && (
              <InvestigationContinuationControls locale={locale} kind="sessions"
                hasMore={Boolean(searchPage.nextCursor)} pending={searchPage.pending}
                error={searchPage.error} added={searchPage.added}
                controls="investigation-session-results" onExhausted={focusResults}
                onMore={onSearchMore} />
            )}
          </div>
        )}
      </aside>
      <article className={styles.investigation} aria-label={c.events}>
        {!query || !matches.length || !selected || !current || (selected.origin === "LIVE" && !selected.timelineComplete) || loading || error ? (
          <p className={styles.empty} role={timelineError ? "alert" : undefined}>{error ?? timelineError ?? (loading || timelineLoading ? c.waiting : selected?.origin === "LIVE" ? c.incomplete : !query ? c.apply : !matches.length ? coverageLimited ? c.noVerifiedMatches : c.adjust : c.choose)}</p>
        ) : (
          <>
            <header className={styles.sessionHeading}>
              <div>
                <span className={styles.eyebrow}>{c.session} / <bdi dir="ltr">{selected.id}</bdi></span>
                <h2>{selected.make} {selected.model}</h2>
                <p>{selected.origin === "LIVE" &&
                  (selected.timelineNextCursor || Object.values(selected.coverage ?? {}).some((source) => source.status !== "AVAILABLE"))
                  ? c.partialSources : c.sources}</p>
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
              <div><h3 ref={timelineHeading} tabIndex={-1}>{selected.origin === "LIVE" &&
                (selected.timelineNextCursor || Object.values(selected.coverage ?? {}).some((source) => source.status !== "AVAILABLE"))
                ? c.loadedEvents : c.events} <span>({orderedEvents.length})</span></h3><small>{selected.origin === "LIVE" && selected.coverage ? Object.entries(selected.coverage).map(([source, value]) => source + ": " + value.status).join(" · ") : c.coverage}</small></div>
              <div className={styles.legend}><span data-kind="match">{c.match}</span><span data-kind="context">{c.inWindow}</span><span data-kind="outside">{c.outside}</span></div>
            </div>
            <ol className={styles.timeline} id="investigation-event-results">
              {orderedEvents.map((event) => (
                <TimelineEvent key={investigationKey(event.source, event.id)} event={event} matched={witnesses.has(event.origin === "LIVE" ? investigationKey(event.source, event.id) : event.id)}
                  query={query} locale={locale} onEvent={onEvent} />
              ))}
            </ol>
            {selected.origin === "LIVE" && onTimelineMore && (
              <InvestigationContinuationControls locale={locale} kind="events"
                hasMore={Boolean(selected.timelineNextCursor)} pending={timelineLoading}
                error={timelineError} controls="investigation-event-results"
                onExhausted={focusTimeline} onMore={onTimelineMore} />
            )}
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
