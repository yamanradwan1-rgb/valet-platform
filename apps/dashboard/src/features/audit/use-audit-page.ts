"use client";

import { useEffect, useMemo, useState } from "react";
import {
  managementAuditKnownEventTypeSchema,
  type ManagementAuditKnownEvent,
  type ManagementAuditResponse,
} from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import { readManagementAudit } from "./audit-api";
import { auditRequestKey } from "./audit-query-identity";
import { auditScope, auditScopeKey } from "./audit-scope";

export function useAuditPage() {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scope = useMemo(
    () => auditScope(dashboard.selectedScope),
    [dashboard.selectedScope],
  );
  const scopeKey = auditScopeKey({ ...dashboard, selectionRevision });
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [eventType, setEventTypeState] = useState<ManagementAuditKnownEvent | null>(null);
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<ManagementAuditResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const cursor = cursors[index] ?? null;
  const requestKey = auditRequestKey({ cursor, eventType, revision, scopeKey });

  useEffect(() => {
    if (!scope) return;
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await readManagementAudit(
          dashboard.api,
          scope,
          { cursor, eventType },
          ticket.signal,
        );
        if (disposed || !guard.isCurrent(ticket)) return;
        setData(response);
        setLoading(false);
      } catch (reason: unknown) {
        if (disposed || !guard.isCurrent(ticket)) return;
        setError(reason);
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      guard.invalidate();
    };
  }, [cursor, dashboard.api, eventType, guard, requestKey, scope]);

  function setEventType(value: string) {
    guard.invalidate();
    const parsed = value === ""
      ? null
      : managementAuditKnownEventTypeSchema.parse(value);
    setEventTypeState(parsed);
    setCursors([null]);
    setIndex(0);
    setData(null);
    setError(null);
  }
  function next() {
    if (!data?.nextCursor) return;
    const nextIndex = index + 1;
    guard.invalidate();
    setCursors((current) => [...current.slice(0, nextIndex), data.nextCursor]);
    setIndex(nextIndex);
  }
  function previous() {
    if (index === 0) return;
    guard.invalidate();
    setIndex((current) => current - 1);
  }
  function retry() {
    guard.invalidate();
    setRevision((current) => current + 1);
  }

  return {
    canNext: Boolean(data?.nextCursor),
    canPrevious: index > 0,
    data,
    error,
    eventType,
    loading,
    next,
    previous,
    retry,
    scope,
    setEventType,
  } as const;
}
