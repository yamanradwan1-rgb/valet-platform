"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { SyntheticAlert } from "./types";

export function useSeenFocusRecovery(
  panelRef: RefObject<HTMLElement | null>,
  bellRef: RefObject<HTMLButtonElement | null>,
  pendingId: string | null,
  seen: Set<string>,
  seenFailure: string | null,
  onSeen: (alert: SyntheticAlert) => void,
) {
  const previousPendingId = useRef<string | null>(null);
  const pendingAlertId = useRef<string | null>(null);
  const nextEligibleAlertIds = useRef<string[]>([]);
  const previousEligibleAlertIds = useRef<string[]>([]);

  const handleSeen = useCallback((alert: SyntheticAlert) => {
    const rows = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      ".alert-feed > li[data-alert-id]",
    ) ?? []);
    const currentIndex = rows.findIndex((row) => row.dataset.alertId === alert.id);
    pendingAlertId.current = alert.id;
    nextEligibleAlertIds.current = currentIndex < 0 ? [] : rows
      .slice(currentIndex + 1)
      .filter((row) => row.querySelector<HTMLButtonElement>(".seen-action:not(:disabled)"))
      .map((row) => row.dataset.alertId)
      .filter((id): id is string => Boolean(id));
    previousEligibleAlertIds.current = currentIndex < 0 ? [] : rows
      .slice(0, currentIndex)
      .reverse()
      .filter((row) => row.querySelector<HTMLButtonElement>(".seen-action:not(:disabled)"))
      .map((row) => row.dataset.alertId)
      .filter((id): id is string => Boolean(id));
    onSeen(alert);
  }, [onSeen, panelRef]);

  useEffect(() => {
    const completedId = previousPendingId.current;
    previousPendingId.current = pendingId;
    if (completedId === null || pendingId !== null) return;

    const rows = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      ".alert-feed > li[data-alert-id]",
    ) ?? []);
    const close = panelRef.current?.querySelector<HTMLButtonElement>(".alerts-close");
    if (seen.has(completedId)) {
      const currentRows = new Map(rows.map((row) => [row.dataset.alertId, row]));
      const nextAction = nextEligibleAlertIds.current
        .map((id) => currentRows.get(id)?.querySelector<HTMLButtonElement>(".seen-action"))
        .find((button): button is HTMLButtonElement => Boolean(button && !button.disabled));
      const previousAction = previousEligibleAlertIds.current
        .map((id) => currentRows.get(id)?.querySelector<HTMLButtonElement>(".seen-action"))
        .find((button): button is HTMLButtonElement => Boolean(button && !button.disabled));
      pendingAlertId.current = null;
      nextEligibleAlertIds.current = [];
      previousEligibleAlertIds.current = [];
      (nextAction ?? previousAction ?? close ?? panelRef.current ?? bellRef.current)?.focus();
      return;
    }

    if (seenFailure === completedId) {
      const failedId = pendingAlertId.current ?? completedId;
      const retryRow = rows.find((row) => row.dataset.alertId === failedId);
      const retryAction = retryRow?.querySelector<HTMLButtonElement>(".seen-action:not(:disabled)");
      pendingAlertId.current = null;
      nextEligibleAlertIds.current = [];
      previousEligibleAlertIds.current = [];
      (retryAction ?? close ?? panelRef.current ?? bellRef.current)?.focus();
      return;
    }

    pendingAlertId.current = null;
    nextEligibleAlertIds.current = [];
    previousEligibleAlertIds.current = [];
  }, [pendingId, seen, seenFailure, panelRef, bellRef]);

  return handleSeen;
}
