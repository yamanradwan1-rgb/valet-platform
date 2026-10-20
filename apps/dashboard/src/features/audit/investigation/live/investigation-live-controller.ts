"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditInvestigationSearchQuery } from "@valet/contracts";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../lib/api/dashboard-api-error";
import type { DemoEvent, DemoMatch, InvestigationDemoLocale, InvestigationDemoQuery } from "../../investigation-demo-types";
import { buildLiveInvestigationQuery, createLiveInvestigationDraft } from "../../investigation-live-query";
import { investigationFailure, investigationFailureText, liveInvestigationError,
  useLiveInvestigationSelectors } from "../../investigation-live-support";
import { readInvestigationSessions } from "../search/investigation-search-client";
import { resolveLiveInvestigationSelectors } from "../search/investigation-selector-resolution";
import type { InvestigationSearchScope } from "../search/investigation-search-scope";
import { attachInvestigationLiveDetail, attachInvestigationLiveTimeline,
  mapInvestigationLiveSearch } from "../timeline/investigation-live-projection";
import { readInvestigationEventDetail, readInvestigationTimeline } from "../timeline/timeline-api";
import { appendInvestigationSessions, initialInvestigationPage,
  nextInvestigationPageState } from "./investigation-pagination-state";

export function useInvestigationLiveController(input: {
  readonly locale: InvestigationDemoLocale;
  readonly api: DashboardApiClient;
  readonly scope: InvestigationSearchScope;
  readonly scopeKey: string;
  readonly locationName: string;
  readonly locationTimezone: string;
}) {
  const { api, scope, scopeKey, locale, locationName, locationTimezone } = input;
  const [draft, setDraft] = useState<InvestigationDemoQuery>(() =>
    createLiveInvestigationDraft(scope.locationId, new Date(), locationTimezone));
  const [applied, setApplied] = useState<InvestigationDemoQuery | null>(null);
  const [matches, setMatches] = useState<readonly DemoMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [event, setEvent] = useState<DemoEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(initialInvestigationPage);
  const epoch = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const matchesRef = useRef<readonly DemoMatch[]>([]);
  const queryRef = useRef<AuditInvestigationSearchQuery | null>(null);
  const inFlight = useRef(false);
  const timelineInFlight = useRef(false);
  const searchAbort = useRef<AbortController | null>(null);
  const timelineAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const selectorReset = useRef<(() => void) | null>(null);

  const abortReads = useCallback(() => {
    epoch.current += 1;
    inFlight.current = false;
    timelineInFlight.current = false;
    searchAbort.current?.abort();
    timelineAbort.current?.abort();
    detailAbort.current?.abort();
    return epoch.current;
  }, []);
  const updateMatches = useCallback((next: (rows: readonly DemoMatch[]) => readonly DemoMatch[]) => {
    matchesRef.current = next(matchesRef.current);
    setMatches(matchesRef.current);
  }, []);
  const revoke = useCallback(() => {
    abortReads();
    selectorReset.current?.();
    matchesRef.current = [];
    queryRef.current = null;
    selectedRef.current = null;
    setMatches([]);
    setSelectedId(null);
    setEvent(null);
    setApplied(null);
    setSearchPage(initialInvestigationPage);
    setBusy(false);
    setTimelineBusy(false);
    setTimelineError(null);
    setError(null);
    setDraft(createLiveInvestigationDraft(scope.locationId, new Date(), locationTimezone));
  }, [abortReads, scope.locationId, locationTimezone]);
  useEffect(() => () => { abortReads(); }, [abortReads]);

  const selectors = useLiveInvestigationSelectors({
    api, scope, scopeKey, slot: draft.slot, locale, revoke,
  });
  useEffect(() => {
    selectorReset.current = selectors.resetProtected;
    return () => { selectorReset.current = null; };
  }, [selectors.resetProtected]);
  const transport = useCallback((signal: AbortSignal) => ({
    api, scope, signal, onAuthReconciled: revoke,
  }), [api, scope, revoke]);

  const timeline = useCallback(async (sessionId: string, cursor: string | null,
    generation: number) => {
    if (timelineInFlight.current) return;
    const row = matchesRef.current.find((item) => item.session.id === sessionId);
    if (!row) return;
    timelineInFlight.current = true;
    const controller = new AbortController();
    timelineAbort.current?.abort();
    timelineAbort.current = controller;
    setTimelineBusy(true);
    setTimelineError(null);
    try {
      const page = await readInvestigationTimeline(api, { ...scope, sessionId },
        cursor, controller.signal, revoke);
      if (controller.signal.aborted || generation !== epoch.current ||
          selectedRef.current !== sessionId) return;
      updateMatches((rows) => rows.map((match) => match.session.id === sessionId
        ? attachInvestigationLiveTimeline({ ...match, session: {
          ...match.session, locationLabel: locationName,
        } }, page) : match));
    } catch (problem: unknown) {
      if (controller.signal.aborted || generation !== epoch.current) return;
      const kind = cursor && problem instanceof DashboardApiError &&
        problem.status === 400 && problem.code === "REQUEST_INVALID"
        ? "restart" : investigationFailure(problem);
      if (kind === "auth") revoke();
      else {
        if (kind === "restart") updateMatches((rows) => rows.map((match) =>
          match.session.id === sessionId ? { ...match, session: {
            ...match.session, events: [], timelineComplete: false,
            timelineNextCursor: null, timelineSnapshotAt: undefined,
          } } : match));
        setTimelineError(investigationFailureText(locale, kind));
      }
    } finally {
      if (generation === epoch.current) setTimelineBusy(false);
      if (timelineAbort.current === controller) timelineInFlight.current = false;
    }
  }, [api, scope, revoke, updateMatches, locationName, locale]);

  const apply = useCallback(async () => {
    const generation = abortReads();
    const controller = new AbortController();
    searchAbort.current = controller;
    queryRef.current = null;
    matchesRef.current = [];
    selectedRef.current = null;
    setMatches([]);
    setSelectedId(null);
    setApplied(null);
    setEvent(null);
    setError(null);
    setTimelineError(null);
    setTimelineBusy(false);
    setSearchPage(initialInvestigationPage);
    setBusy(true);
    try {
      if (!selectors.options || selectors.optionsError)
        throw new Error("SELECTOR_SOURCE_UNAVAILABLE");
      const options = selectors.options;
      const resolved = resolveLiveInvestigationSelectors({
        query: draft, employeeOptions: selectors.memberOptions,
        slotOptions: options.slots, scopeKey,
        employeeScopeKey: options.scopeKey,
        slotScopeKey: draft.slot && options.slotQuery !== draft.slot ? "" : options.scopeKey,
        slotOptionsComplete: options.slotOptionsComplete,
      });
      if (draft.employee && !selectors.memberOptions.some((row) => row.id === draft.employee))
        throw new Error("INVALID_MEMBER_SELECTION");
      if (resolved.kind !== "resolved") throw new Error("INVALID_CANONICAL_SELECTOR");
      const query = buildLiveInvestigationQuery(draft, scope.locationId,
        resolved, locationTimezone);
      const response = await readInvestigationSessions(transport(controller.signal), query);
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (response.nextCursor && !response.items.length)
        throw new Error("INVESTIGATION_SEARCH_EMPTY_CONTINUATION");
      const rows = mapInvestigationLiveSearch(response, locationTimezone);
      queryRef.current = query;
      matchesRef.current = rows;
      setMatches(rows);
      setSearchPage(nextInvestigationPageState(initialInvestigationPage, response, rows.length));
      setApplied({ ...draft, fromUtc: query.from, toUtc: query.to });
      const first = rows[0];
      selectedRef.current = first?.session.id ?? null;
      setSelectedId(selectedRef.current);
      setBusy(false);
      if (first) void timeline(first.session.id, null, generation);
    } catch (problem: unknown) {
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (investigationFailure(problem) === "auth") revoke();
      else setError(liveInvestigationError(locale, problem));
      setBusy(false);
    }
  }, [abortReads, selectors, draft, scope.locationId, scopeKey,
    transport, locationTimezone, timeline, locale, revoke]);

  const loadMoreSearch = useCallback(async () => {
    if (inFlight.current || !queryRef.current || !searchPage.nextCursor) return;
    inFlight.current = true;
    const generation = epoch.current;
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchPage((current) => ({ ...current, pending: true, error: null }));
    try {
      const page = await readInvestigationSessions(transport(controller.signal), {
        ...queryRef.current, cursor: searchPage.nextCursor,
      });
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (page.nextCursor && (!page.items.length || page.nextCursor === searchPage.nextCursor))
        throw new Error("INVESTIGATION_SEARCH_STALLED_CURSOR");
      const rows = mapInvestigationLiveSearch(page, locationTimezone);
      const appended = appendInvestigationSessions(matchesRef.current, rows);
      const added = appended.length - matchesRef.current.length;
      const state = nextInvestigationPageState(searchPage, page, added);
      matchesRef.current = appended;
      setMatches(appended);
      setSearchPage(state);
    } catch (problem: unknown) {
      if (controller.signal.aborted || generation !== epoch.current) return;
      const kind = problem instanceof DashboardApiError &&
        problem.status === 400 && problem.code === "REQUEST_INVALID"
        ? "restart" : investigationFailure(problem);
      if (kind === "auth") revoke();
      else if (kind === "restart") {
        revoke();
        setError(investigationFailureText(locale, kind));
      } else setSearchPage((current) => ({ ...current, pending: false,
        error: investigationFailureText(locale, kind) }));
    } finally {
      if (searchAbort.current === controller) inFlight.current = false;
    }
  }, [searchPage, transport, locationTimezone, locale, revoke]);

  const select = useCallback((id: string) => {
    const row = matchesRef.current.find((item) => item.session.id === id);
    if (!row) return;
    const generation = abortReads();
    setSearchPage((current) => ({ ...current, pending: false }));
    selectedRef.current = id;
    setSelectedId(id);
    setEvent(null);
    setTimelineError(null);
    if (!row.session.timelineComplete) void timeline(id, null, generation);
  }, [abortReads, timeline]);
  const loadMoreTimeline = useCallback(() => {
    const id = selectedRef.current;
    const row = matchesRef.current.find((item) => item.session.id === id);
    if (id && row?.session.timelineComplete && row.session.timelineNextCursor)
      void timeline(id, row.session.timelineNextCursor, epoch.current);
  }, [timeline]);
  const openEvent = useCallback(async (selected: DemoEvent) => {
    if (selected.origin !== "LIVE" || selected.session !== selectedRef.current) return;
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    const generation = epoch.current;
    setEvent(null);
    try {
      const detail = await readInvestigationEventDetail(api, {
        ...scope, sessionId: selected.session,
      }, selected.source === "KEY" ? "KEY_CUSTODY" : selected.source,
      selected.id, controller.signal, revoke);
      if (!controller.signal.aborted && epoch.current === generation &&
          selectedRef.current === selected.session)
        setEvent(attachInvestigationLiveDetail(selected, detail));
    } catch (problem: unknown) {
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (investigationFailure(problem) === "auth") revoke();
      else setTimelineError(liveInvestigationError(locale, problem));
    }
  }, [api, scope, revoke, locale]);
  const clear = useCallback(() => {
    revoke();
    selectors.resetMembers();
    setDraft(createLiveInvestigationDraft(scope.locationId, new Date(), locationTimezone));
  }, [revoke, selectors, scope.locationId, locationTimezone]);
  return {
    draft, setDraft, applied, matches, selectedId, event, setEvent,
    error, busy, timelineBusy, timelineError, searchPage, selectors,
    apply, clear, select, openEvent, loadMoreSearch, loadMoreTimeline,
  };
}
