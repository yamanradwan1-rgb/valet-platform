"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManagementVisitHistoryResponse } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import {
  readCustomerVisitHistory,
  readVehicleVisitHistory,
} from "./visit-contacts-api";
import {
  visitHistoryRequestKey,
  type VisitHistorySubject,
} from "./visit-history-query-identity";
import { visitContactScope, visitContactScopeKey } from "./visit-contact-scope";

export type { VisitHistorySubject } from "./visit-history-query-identity";

export function useVisitHistory(subject: VisitHistorySubject) {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scope = useMemo(
    () => visitContactScope(dashboard.selectedScope),
    [dashboard.selectedScope],
  );
  const scopeKey = visitContactScopeKey({ ...dashboard, selectionRevision });
  const [guard] = useState(() => new ScopeGenerationGuard());
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<ManagementVisitHistoryResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const cursor = cursors[index] ?? null;
  const subjectKey = visitHistoryRequestKey({
    cursor,
    revision,
    scopeKey,
    subject,
  });

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
        const response = subject.kind === "CUSTOMER"
          ? await readCustomerVisitHistory(
              dashboard.api, scope.organizationId, subject.id, cursor, ticket.signal,
            )
          : await readVehicleVisitHistory(
              dashboard.api, scope.organizationId, subject.id, cursor, ticket.signal,
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
  }, [cursor, dashboard.api, guard, revision, scope, subject.id, subject.kind, subjectKey]);

  return {
    canNext: Boolean(data?.nextCursor),
    canPrevious: index > 0,
    data,
    error,
    loading,
    next: () => {
      if (!data?.nextCursor) return;
      const nextIndex = index + 1;
      guard.invalidate();
      setCursors((current) => [...current.slice(0, nextIndex), data.nextCursor]);
      setIndex(nextIndex);
    },
    previous: () => {
      if (index === 0) return;
      guard.invalidate();
      setIndex((current) => current - 1);
    },
    retry: () => {
      guard.invalidate();
      setRevision((current) => current + 1);
    },
  } as const;
}
