"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { InvestigationEventDrawer } from "./investigation-event-drawer";
import { InvestigationSearchPanel } from "./investigation-search-panel";
import { InvestigationWorkspace } from "./investigation-workspace";
import type {
  DemoEvent, DemoMatch, InvestigationDemoLocale, InvestigationDemoQuery,
} from "./investigation-demo-types";
import { createLiveInvestigationDraft, buildLiveInvestigationQuery } from "./investigation-live-query";
import {
  readInvestigationSearchFilters, readInvestigationSessions,
} from "./investigation/search/investigation-search-client";
import {
  resolveLiveInvestigationSelectors,
  type InvestigationSelectorOption,
} from "./investigation/search/investigation-selector-resolution";
import {
  attachInvestigationLiveTimeline, mapInvestigationLiveSearch,
  attachInvestigationLiveDetail,
} from "./investigation/timeline/investigation-live-projection";
import {
  readInvestigationEventDetail, readInvestigationTimeline,
} from "./investigation/timeline/timeline-api";
import type { InvestigationSearchScope } from "./investigation/search/investigation-search-scope";
import styles from "./investigation-demo.module.css";

interface Props {
  readonly locale: InvestigationDemoLocale;
  readonly api: DashboardApiClient;
  readonly scope: InvestigationSearchScope;
  readonly locationName: string;
}

interface Options {
  readonly members: readonly InvestigationSelectorOption[];
  readonly slots: readonly InvestigationSelectorOption[];
  readonly slotOptionsComplete: boolean;
  readonly scopeKey: string;
}

function selectorLabel(id: string, value: string | null): InvestigationSelectorOption {
  return { id, label: value ?? id };
}

function uiError(locale: InvestigationDemoLocale, problem: unknown): string {
  // Intentionally do not echo server/body/SQL/Incident details into the UI.
  const code = problem instanceof Error ? problem.message : "";
  const unsupported = /PAGINATION|SNAPSHOT|TIMELINE_UNAVAILABLE|503|INCOMPLETE/.test(code);
  if (locale === "ar") return unsupported
    ? "التاريخ أكبر من حدّ القراءة الموثوق حالياً؛ ضيّق فترة البحث. لا يتم عرض نتائج جزئية."
    : "تعذرت قراءة بيانات التحقيق المصرح بها. تحقق من النطاق والتوقيت والصلاحيات ثم حاول مجدداً.";
  return unsupported
    ? "History exceeds the currently proven read bound. Narrow the search; no partial history is shown."
    : "Could not retrieve authorized investigation records. Verify scope, window and access, then retry.";
}

/** Live-data coordinator only; uses the exact approved Concept A component
 * structure/classes. Its results are never sourced from the demo fixtures.
 */
export function InvestigationLive({ locale, api, scope, locationName }: Props) {
  const scopeKey = [
    scope.organizationId, scope.locationId, scope.role, scope.identityGeneration,
    scope.sessionGeneration, scope.selectionRevision,
  ].join(":");
  const [draft, setDraft] = useState<InvestigationDemoQuery>(
    () => createLiveInvestigationDraft(scope.locationId),
  );
  const [applied, setApplied] = useState<InvestigationDemoQuery | null>(null);
  const [matches, setMatches] = useState<readonly DemoMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [event, setEvent] = useState<DemoEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const workId = useRef(0);
  const workSignal = useRef<AbortController | null>(null);
  const detailsSignal = useRef<AbortController | null>(null);
  const selectorSignal = useRef<AbortController | null>(null);

  useEffect(() => () => {
    workId.current += 1;
    workSignal.current?.abort();
    detailsSignal.current?.abort();
    selectorSignal.current?.abort();
  }, []);

  const invalidate = useCallback(() => {
    workId.current += 1;
    workSignal.current?.abort();
    detailsSignal.current?.abort();
    const controller = new AbortController();
    workSignal.current = controller;
    return { id: workId.current, signal: controller.signal };
  }, []);

  const revoke = useCallback(() => {
    invalidate();
    selectorSignal.current?.abort();
    setMatches([]);
    setSelectedId(null);
    setEvent(null);
    setApplied(null);
    setOptions(null);
    setOptionsError(null);
    setBusy(false);
    setTimelineBusy(false);
  }, [invalidate]);

  useEffect(() => {
    const controller = new AbortController();
    selectorSignal.current = controller;
    const context = {
      api, scope, signal: controller.signal, onAuthReconciled: revoke,
    };
    void Promise.all([
      readInvestigationSearchFilters(context, { kind: "MEMBER", limit: 20 }),
      readInvestigationSearchFilters(context, { kind: "KEY_SLOT", limit: 20 }),
    ]).then(([members, slots]) => {
      if (controller.signal.aborted) return;
      setOptions({
        members: members.items.map((item) => selectorLabel(item.id, item.currentLabel.value)),
        slots: slots.items.map((item) => selectorLabel(item.id, item.currentLabel.value)),
        slotOptionsComplete: !slots.hasMore && slots.nextCursor === null,
        scopeKey,
      });
    }).catch((problem: unknown) => {
      if (!controller.signal.aborted) setOptionsError(uiError(locale, problem));
    });
    return () => controller.abort();
    // scope identity/revision changes remount the parent; key still fences reads.
  }, [api, locale, revoke, scopeKey, scope]);

  async function fetchTimeline(match: DemoMatch, id: number, signal: AbortSignal) {
    const timeline = await readInvestigationTimeline(api, {
      ...scope, sessionId: match.session.id,
    }, null, signal);
    if (signal.aborted || id !== workId.current) return;
    const withScope: DemoMatch = {
      ...match,
      session: { ...match.session, locationLabel: locationName },
    };
    const complete = attachInvestigationLiveTimeline(withScope, timeline);
    if (signal.aborted || id !== workId.current) return;
    setMatches((current) => current.map((row) =>
      row.session.id === complete.session.id ? complete : row));
    setTimelineBusy(false);
  }

  async function apply() {
    const work = invalidate();
    setError(null);
    setEvent(null);
    setApplied(null);
    setMatches([]);
    setSelectedId(null);
    setBusy(true);
    setTimelineBusy(false);
    try {
      const resolved = resolveLiveInvestigationSelectors({
        query: draft,
        employeeOptions: options?.members ?? [],
        slotOptions: options?.slots ?? [],
        scopeKey,
        employeeScopeKey: options?.scopeKey ?? "",
        slotScopeKey: options?.scopeKey ?? "",
        slotOptionsComplete: options?.slotOptionsComplete ?? false,
      });
      if (resolved.kind !== "resolved") {
        throw new Error("INVALID_OR_INCOMPLETE_CANONICAL_SELECTOR");
      }
      const query = buildLiveInvestigationQuery(draft, scope.locationId, resolved);
      const data = await readInvestigationSessions({
        api, scope, signal: work.signal, onAuthReconciled: revoke,
      }, query);
      if (work.signal.aborted || work.id !== workId.current) return;
      if (data.nextCursor !== null) throw new Error("SEARCH_PAGINATION_INCOMPLETE");
      const rows = mapInvestigationLiveSearch(data);
      setMatches(rows);
      setApplied({ ...draft });
      setBusy(false);
      const first = rows[0];
      setSelectedId(first?.session.id ?? null);
      if (first) {
        setTimelineBusy(true);
        await fetchTimeline(first, work.id, work.signal);
      }
    } catch (problem: unknown) {
      if (work.signal.aborted || work.id !== workId.current) return;
      // Never show partial Search/Timeline after a failed source/query.
      setMatches([]);
      setSelectedId(null);
      setApplied(null);
      setBusy(false);
      setTimelineBusy(false);
      setError(uiError(locale, problem));
    }
  }

  async function select(id: string) {
    const existing = matches.find((row) => row.session.id === id);
    if (!existing) return;
    const work = invalidate();
    setSelectedId(id);
    setEvent(null);
    setTimelineBusy(!existing.session.timelineComplete);
    setError(null);
    if (existing.session.timelineComplete) return;
    try {
      await fetchTimeline(existing, work.id, work.signal);
    } catch (problem: unknown) {
      if (work.signal.aborted || work.id !== workId.current) return;
      setMatches((current) => current.map((row) => row.session.id === id
        ? { ...row, session: { ...row.session, events: [], timelineComplete: false } } : row));
      setTimelineBusy(false);
      setError(uiError(locale, problem));
    }
  }

  async function openEvent(selected: DemoEvent) {
    if (!selectedId || selected.session !== selectedId || selected.origin !== "LIVE") return;
    detailsSignal.current?.abort();
    const controller = new AbortController();
    detailsSignal.current = controller;
    setEvent(null);
    setError(null);
    try {
      const source = selected.source === "KEY" ? "KEY_CUSTODY" : selected.source;
      const detail = await readInvestigationEventDetail(api, {
        ...scope, sessionId: selectedId,
      }, source, selected.id, controller.signal);
      if (controller.signal.aborted || selectedId !== selected.session) return;
      setEvent(attachInvestigationLiveDetail(selected, detail));
    } catch (problem: unknown) {
      if (!controller.signal.aborted) setError(uiError(locale, problem));
    }
  }

  function clear() {
    invalidate();
    setMatches([]);
    setSelectedId(null);
    setEvent(null);
    setApplied(null);
    setBusy(false);
    setTimelineBusy(false);
    setDraft(createLiveInvestigationDraft(scope.locationId));
    setError(null);
  }

  return (
    <section aria-label={locale === "ar" ? "بحث التحقيق الحقيقي" : "Live Investigation Search"}
      className={styles.root}>
      <InvestigationSearchPanel locale={locale} value={draft} onChange={setDraft}
        onApply={() => void apply()} onClear={clear} error={error}
        live locationName={locationName} employeeOptions={options?.members ?? []}
        slotOptions={options?.slots ?? []} selectorError={optionsError} />
      <InvestigationWorkspace locale={locale} matches={matches} selectedId={selectedId}
        onSelect={(id) => void select(id)} onEvent={(row) => void openEvent(row)}
        query={applied} loading={busy || timelineBusy} error={error} />
      <InvestigationEventDrawer event={event} locale={locale}
        onClose={() => setEvent(null)} />
    </section>
  );
}
