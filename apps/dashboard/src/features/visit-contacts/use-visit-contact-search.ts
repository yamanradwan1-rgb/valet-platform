"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManagementVisitContactSearchResponse } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import {
  buildVisitContactSearchQuery,
  searchVisitContacts,
  type VisitSearchMode,
} from "./visit-contacts-api";
import {
  normalizeVisitSearchIdentity,
  visitContactSearchRequestKey,
  type VisitContactSearchDraft,
} from "./visit-contact-query-identity";
import { isVisitContactAuthorityLoss } from "./visit-contact-errors";
import { visitContactScope, visitContactScopeKey } from "./visit-contact-scope";

interface SubmittedSearch {
  readonly draft: VisitContactSearchDraft;
  readonly identity: string;
  readonly mode: VisitSearchMode;
}

const emptyDraft: VisitContactSearchDraft = {
  name: "", phone: "", plate: "", plateCountry: "",
};

export function useVisitContactSearch(
  onAuthorityLoss?: (reason: unknown) => void,
) {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scope = useMemo(
    () => visitContactScope(dashboard.selectedScope),
    [dashboard.selectedScope],
  );
  const scopeKey = visitContactScopeKey({ ...dashboard, selectionRevision });
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [mode, setModeState] = useState<VisitSearchMode>("NAME");
  const [draft, setDraft] = useState<VisitContactSearchDraft>(emptyDraft);
  const [submitted, setSubmitted] = useState<SubmittedSearch | null>(null);
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [data, setData] = useState<ManagementVisitContactSearchResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [completedRevision, setCompletedRevision] = useState(0);
  const cursor = cursors[cursorIndex] ?? null;

  const query = useMemo(() => {
    if (!submitted) return null;
    return buildVisitContactSearchQuery({
      cursor,
      mode: submitted.mode,
      name: submitted.draft.name,
      phone: submitted.draft.phone,
      plate: submitted.draft.plate,
      plateCountry: submitted.draft.plateCountry,
    });
  }, [cursor, submitted]);
  const requestKey = visitContactSearchRequestKey({
    cursor,
    queryIdentity: submitted?.identity ?? null,
    revision,
    scopeKey,
  });

  useEffect(() => {
    if (!scope || !query || !submitted) {
      guard.invalidate();
      return;
    }
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await searchVisitContacts(
          dashboard.api,
          scope.organizationId,
          query,
          ticket.signal,
        );
        if (disposed || !guard.isCurrent(ticket)) return;
        setData(response);
        setCompletedRevision((current) => current + 1);
        setLoading(false);
      } catch (reason: unknown) {
        if (disposed || !guard.isCurrent(ticket)) return;
        if (isVisitContactAuthorityLoss(reason)) onAuthorityLoss?.(reason);
        setError(reason);
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      guard.invalidate();
    };
  }, [dashboard.api, guard, onAuthorityLoss, query, requestKey, scope, submitted]);

  function setMode(next: VisitSearchMode) {
    guard.invalidate();
    setModeState(next);
    setDraft(emptyDraft);
    setSubmitted(null);
    setCursors([null]);
    setCursorIndex(0);
    setData(null);
    setError(null);
  }

  function submit(): boolean {
    try {
      buildVisitContactSearchQuery({ mode, ...draft });
    } catch {
      setError(new Error("VISIT_CONTACT_SEARCH_INVALID"));
      return false;
    }
    guard.invalidate();
    setCursors([null]);
    setCursorIndex(0);
    setData(null);
    setError(null);
    setSubmitted({ draft, identity: normalizeVisitSearchIdentity(mode, draft), mode });
    return true;
  }

  function next() {
    if (!data?.nextCursor || mode === "PLATE") return;
    guard.invalidate();
    const nextIndex = cursorIndex + 1;
    setCursors((current) => [...current.slice(0, nextIndex), data.nextCursor]);
    setCursorIndex(nextIndex);
  }
  function previous() {
    if (cursorIndex === 0) return;
    guard.invalidate();
    setCursorIndex((current) => current - 1);
  }
  function reload() {
    if (!submitted) return;
    guard.invalidate();
    setData(null);
    setError(null);
    setRevision((current) => current + 1);
  }
  function failCurrent(reason: unknown) {
    guard.invalidate();
    if (isVisitContactAuthorityLoss(reason)) onAuthorityLoss?.(reason);
    setCursors([null]);
    setCursorIndex(0);
    setData(null);
    setError(reason);
  }

  return {
    canNext: mode !== "PLATE" && Boolean(data?.nextCursor),
    canPrevious: cursorIndex > 0,
    completedRevision,
    data,
    draft,
    error,
    failCurrent,
    loading,
    mode,
    next,
    previous,
    reload,
    scope,
    setDraft,
    setMode,
    submit,
    submitted,
  } as const;
}
