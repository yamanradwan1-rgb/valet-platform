import type { InvestigationDemoLocale } from "./investigation-demo-types";
import type { InvestigationSelectorOption } from "./investigation/search/investigation-selector-resolution";
import {
  readInvestigationSearchFilters,
  type InvestigationSearchTransport,
} from "./investigation/search/investigation-search-client";
import { loadInvestigationMemberOptions } from "./investigation/search/investigation-member-options";
import { investigationSearchScopeKey } from "./investigation/search/investigation-search-scope";

export interface InvestigationLiveOptions {
  readonly members: readonly InvestigationSelectorOption[];
  /** False means the server cannot expose a complete bounded list; never
   * display a misleading first-page subset. Other filters remain usable. */
  readonly memberOptionsComplete: boolean;
  readonly slots: readonly InvestigationSelectorOption[];
  readonly slotOptionsComplete: boolean;
  readonly slotQuery: string;
  readonly scopeKey: string;
}

/** Complete bounded MEMBER directory or fail closed; never expose first-20 as
 * an exhaustive canonical selector. KeySlot can be refined with typed code.
 */
export async function readLiveSelectorOptions(
  context: InvestigationSearchTransport,
  localScopeKey: string,
  isCurrent: () => boolean,
  slotCode = "",
): Promise<InvestigationLiveOptions> {
  const [members, slots] = await Promise.all([
    loadInvestigationMemberOptions(context, {
      scopeKey: investigationSearchScopeKey(context.scope),
      isScopeCurrent: isCurrent,
    }),
    readInvestigationSearchFilters(context, {
      kind: "KEY_SLOT", limit: 20,
      ...(slotCode ? { text: slotCode } : {}),
    }),
  ]);
  if (!isCurrent() || context.signal.aborted) throw new Error("STALE_MEMBER_OPTIONS");
  return {
    members: members.status === "complete" ? members.options : [],
    memberOptionsComplete: members.status === "complete",
    slots: slots.items.map((item) => selectorLabel(item.id, item.currentLabel.value)),
    slotOptionsComplete: !slots.hasMore && slots.nextCursor === null,
    slotQuery: slotCode,
    scopeKey: localScopeKey,
  };
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
