import type { AnalyticsPeriodQuery } from "@valet/contracts";

import {
  dashboardPeriodPresets,
  type DashboardPeriodPreset,
} from "./dashboard-period-calendar";
import {
  validateAnalyticsPeriod,
  type AnalyticsPeriodValidation,
} from "./intelligence-period-validation";

export type DashboardPeriodSelection =
  | { readonly kind: "PRESET"; readonly preset: DashboardPeriodPreset }
  | { readonly kind: "CUSTOM"; readonly period: AnalyticsPeriodQuery };

export type DashboardPeriodUrl =
  | { readonly kind: "pending" }
  | { readonly kind: "invalid"; readonly validation: AnalyticsPeriodValidation }
  | { readonly kind: "selected"; readonly selection: DashboardPeriodSelection };

export function parseDashboardPeriodUrl(search: string): DashboardPeriodUrl {
  const query = new URLSearchParams(search);
  const from = query.getAll("from");
  const to = query.getAll("to");
  const preset = query.getAll("preset");
  if (from.length > 1 || to.length > 1 || preset.length > 1) {
    return { kind: "invalid", validation: { kind: "invalid-date" } };
  }
  if (preset.length) {
    if (
      from.length ||
      to.length ||
      !dashboardPeriodPresets.includes(preset[0] as DashboardPeriodPreset)
    ) {
      return { kind: "invalid", validation: { kind: "invalid-date" } };
    }
    return {
      kind: "selected",
      selection: { kind: "PRESET", preset: preset[0] as DashboardPeriodPreset },
    };
  }
  if (!from.length && !to.length) {
    return { kind: "selected", selection: { kind: "PRESET", preset: "TODAY" } };
  }
  const validation = validateAnalyticsPeriod(from[0] ?? null, to[0] ?? null);
  return validation.kind === "valid"
    ? {
        kind: "selected",
        selection: { kind: "CUSTOM", period: validation.period },
      }
    : { kind: "invalid", validation };
}

export function periodSelectionSearch(
  currentSearch: string,
  selection: DashboardPeriodSelection,
): string {
  const query = new URLSearchParams(currentSearch);
  query.delete("from");
  query.delete("to");
  query.delete("preset");
  if (selection.kind === "PRESET") query.set("preset", selection.preset);
  else {
    query.set("from", selection.period.from);
    query.set("to", selection.period.to);
  }
  return query.toString();
}
