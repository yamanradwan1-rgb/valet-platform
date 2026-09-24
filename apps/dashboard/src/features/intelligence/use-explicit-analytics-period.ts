"use client";

import type { AnalyticsPeriodQuery } from "@valet/contracts";
import { useCallback, useSyncExternalStore } from "react";

import { validateAnalyticsPeriod } from "./intelligence-period-validation";

const periodChangedEvent = "md05:period-changed";
const emptyPeriodKey = JSON.stringify([null, null]);

function periodKeyFromCurrentUrl(): string {
  if (typeof window === "undefined") return emptyPeriodKey;
  const query = new URLSearchParams(window.location.search);
  return JSON.stringify([query.get("from"), query.get("to")]);
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

function rawPeriodFromKey(key: string): readonly [string | null, string | null] {
  return JSON.parse(key) as [string | null, string | null];
}

export function useExplicitAnalyticsPeriod() {
  const periodKey = useSyncExternalStore(
    subscribePeriod,
    periodKeyFromCurrentUrl,
    () => emptyPeriodKey,
  );
  const [rawFrom, rawTo] = rawPeriodFromKey(periodKey);
  const validation = validateAnalyticsPeriod(rawFrom, rawTo);
  const period = validation.kind === "valid" ? validation.period : null;

  const applyPeriod = useCallback((next: AnalyticsPeriodQuery) => {
    writePeriodToCurrentUrl(next);
  }, []);

  return { applyPeriod, period, rawFrom, rawTo, validation } as const;
}
