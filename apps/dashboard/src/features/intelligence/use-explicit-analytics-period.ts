"use client";

import type { AnalyticsPeriodQuery } from "@valet/contracts";
import { useCallback, useSyncExternalStore } from "react";

const canonicalDate = /^\d{4}-\d{2}-\d{2}$/;
const periodChangedEvent = "md05:period-changed";

export function explicitAnalyticsPeriod(
  from: string,
  to: string,
): AnalyticsPeriodQuery | null {
  if (!canonicalDate.test(from) || !canonicalDate.test(to) || from > to) {
    return null;
  }
  return { from, to };
}

function periodKeyFromCurrentUrl(): string {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search);
  const period = explicitAnalyticsPeriod(
    query.get("from") ?? "",
    query.get("to") ?? "",
  );
  return period ? `${period.from}|${period.to}` : "";
}

function writePeriodToCurrentUrl(period: AnalyticsPeriodQuery): void {
  const url = new URL(window.location.href);
  url.searchParams.set("from", period.from);
  url.searchParams.set("to", period.to);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(periodChangedEvent));
}

function subscribePeriod(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(periodChangedEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(periodChangedEvent, onChange);
  };
}

function periodFromKey(key: string): AnalyticsPeriodQuery | null {
  if (!key) return null;
  const separator = key.indexOf("|");
  return {
    from: key.slice(0, separator),
    to: key.slice(separator + 1),
  };
}

export function useExplicitAnalyticsPeriod() {
  const periodKey = useSyncExternalStore(
    subscribePeriod,
    periodKeyFromCurrentUrl,
    () => "",
  );
  const period = periodFromKey(periodKey);

  const applyPeriod = useCallback((next: AnalyticsPeriodQuery) => {
    writePeriodToCurrentUrl(next);
  }, []);

  return { applyPeriod, period } as const;
}
