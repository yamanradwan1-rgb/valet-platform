import type { InvestigationDemoLocale } from "./investigation-demo-types";
import type { InvestigationSelectorOption } from "./investigation/search/investigation-selector-resolution";

export interface InvestigationLiveOptions {
  readonly members: readonly InvestigationSelectorOption[];
  readonly slots: readonly InvestigationSelectorOption[];
  readonly slotOptionsComplete: boolean;
  readonly slotQuery: string;
  readonly scopeKey: string;
}

export function selectorLabel(id: string, value: string | null): InvestigationSelectorOption {
  return { id, label: value ?? id };
}

export function liveInvestigationError(locale: InvestigationDemoLocale, problem: unknown): string {
  // Never echo response bodies, SQL, private Incident descriptions or auth tokens.
  const code = problem instanceof Error ? problem.message : "";
  const unsupported = /PAGINATION|SNAPSHOT|TIMELINE_UNAVAILABLE|503|INCOMPLETE/.test(code);
  if (locale === "ar") return unsupported
    ? "التاريخ أكبر من حدّ القراءة الموثوق حالياً؛ ضيّق فترة البحث. لا يتم عرض نتائج جزئية."
    : "تعذرت قراءة بيانات التحقيق المصرح بها. تحقق من النطاق والتوقيت والصلاحيات ثم حاول مجدداً.";
  return unsupported
    ? "History exceeds the currently proven read bound. Narrow the search; no partial history is shown."
    : "Could not retrieve authorized investigation records. Verify scope, window and access, then retry.";
}
