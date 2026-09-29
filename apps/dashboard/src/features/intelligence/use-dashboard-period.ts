"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AnalyticsPeriodQuery } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import {
  civilDateAt,
  resolvePeriodPresetFromCivilDate,
  scopeCalendarTimezone,
  type DashboardPeriodPreset,
} from "./dashboard-period-calendar";
import {
  parseDashboardPeriodUrl,
  periodSelectionSearch,
  type DashboardPeriodSelection,
} from "./dashboard-period-selection";
import type { AnalyticsPeriodValidation } from "./intelligence-period-validation";

const changedEvent = "md05:period-changed";
const serverSnapshot = "__server_pending__";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(changedEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(changedEvent, onChange);
  };
}

function writeSelection(selection: DashboardPeriodSelection) {
  const url = new URL(window.location.href);
  url.search = periodSelectionSearch(url.search, selection);
  window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(new Event(changedEvent));
}

function useCivilToday(timezone: string | null, active: boolean): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active || !timezone) return () => {};
      let timer: ReturnType<typeof setTimeout> | null = null;
      function tick() {
        if (document.visibilityState === "visible" && navigator.onLine)
          onChange();
        timer = setTimeout(tick, 60_000);
      }
      timer = setTimeout(tick, 60_000);
      const resume = () => {
        if (document.visibilityState === "visible" && navigator.onLine)
          onChange();
      };
      resume();
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
      return () => {
        if (timer) clearTimeout(timer);
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("online", resume);
      };
    },
    [active, timezone],
  );
  const getSnapshot = useCallback(
    () => (active && timezone ? civilDateAt(Date.now(), timezone) : ""),
    [active, timezone],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}

export function useDashboardPeriod() {
  const { selectedScope } = useProtectedDashboard();
  const timezone = scopeCalendarTimezone(selectedScope);
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => serverSnapshot,
  );
  const parsed =
    search === serverSnapshot
      ? { kind: "pending" as const }
      : parseDashboardPeriodUrl(search);
  const selection = parsed.kind === "selected" ? parsed.selection : null;
  const today = useCivilToday(timezone, selection?.kind === "PRESET");
  const period =
    selection?.kind === "CUSTOM"
      ? selection.period
      : selection?.kind === "PRESET" && today
        ? resolvePeriodPresetFromCivilDate(today, selection.preset)
        : null;
  const validation: AnalyticsPeriodValidation =
    parsed.kind === "invalid"
      ? parsed.validation
      : period
        ? { kind: "valid", period }
        : { kind: "required" };
  const selectPreset = useCallback((preset: DashboardPeriodPreset) => {
    writeSelection({ kind: "PRESET", preset });
  }, []);
  const applyCustom = useCallback((next: AnalyticsPeriodQuery) => {
    writeSelection({ kind: "CUSTOM", period: next });
  }, []);
  return {
    applyCustom,
    period,
    selectPreset,
    selection,
    timezone,
    validation,
  } as const;
}
