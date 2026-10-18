import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { InvestigationDemoLocale } from "./investigation-demo-types";
import type { InvestigationSelectorOption } from "./investigation/search/investigation-selector-resolution";
import {
  readInvestigationSearchFilters,
  type InvestigationSearchTransport,
} from "./investigation/search/investigation-search-client";
import { loadInvestigationMemberOptions, readInvestigationMemberPage } from "./investigation/search/investigation-member-options";
import { investigationSearchScopeKey } from "./investigation/search/investigation-search-scope";
import type { InvestigationSearchScope } from "./investigation/search/investigation-search-scope";

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

export type InvestigationFailure = "auth" | "restart" | "source" | "transient";

export function investigationFailure(problem: unknown): InvestigationFailure {
  if (problem instanceof DashboardApiError) {
    if (["auth", "authorization", "mfa", "entitlement"].includes(problem.kind)) return "auth";
    if ([409, 410, 412].includes(problem.status) ||
        /CURSOR|SNAPSHOT|INVALIDATED|COHORT|EXPIRED/.test(problem.code)) return "restart";
    if (problem.status === 503 || problem.kind === "malformed") return "source";
    return "transient";
  }
  const code = problem instanceof Error ? problem.message : "";
  if (/SNAPSHOT|INVALIDATED|EXPIRED|PAGE_ORDER/.test(code)) return "restart";
  if (/UNAVAILABLE|INCOMPLETE|INTEGRITY|SOURCE/.test(code)) return "source";
  return "transient";
}

/** Authorization failures from any selector lane revoke the entire protected
 * Investigation surface. Transient failures remain locally retryable. */
export function reconcileInvestigationAuthorization(problem: unknown,
  revoke: () => void): boolean {
  if (investigationFailure(problem) !== "auth") return false;
  revoke();
  return true;
}

export function investigationFailureText(locale: InvestigationDemoLocale,
  category: InvestigationFailure): string {
  const ar = {
    auth: "انتهت صلاحية الوصول. أعد التحقق من هويتك ونطاقك ثم طبّق بحثاً جديداً.",
    restart: "انتهت صلاحية صفحة البحث أو تغيّرت هوية البيانات. اضغط تطبيق لبدء بحث جديد؛ قد يلزم تضييق الفترة أو إزالة فلاتر المركبة الحالية.",
    source: "أحد مصادر الأدلة غير متاح أو لا يمكن التحقق من اكتماله؛ النتائج المعروضة لا تمثل التاريخ كاملاً.",
    transient: "تعذر تحميل الصفحة التالية؛ يمكنك إعادة المحاولة.",
  };
  const en = {
    auth: "Access changed. Reauthorize the scope, then apply a new search.",
    restart: "This result set expired or its current identity changed. Use Apply to restart; narrow the window or remove current vehicle filters if continuation remains unsupported.",
    source: "An evidence source is unavailable or incomplete; loaded records are not the full history.",
    transient: "Could not load the next page. You can retry.",
  };
  return (locale === "ar" ? ar : en)[category];
}

interface MemberPage {
  readonly prefix: string;
  readonly options: readonly InvestigationSelectorOption[];
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** The directory is scoped to the auth/selection generation and only one
 * authorized page is fetched for each explicit Next action. */
export function useLiveInvestigationSelectors(input: {
  api: DashboardApiClient;
  scope: InvestigationSearchScope;
  scopeKey: string;
  slot: string;
  locale: InvestigationDemoLocale;
  revoke: () => void;
}) {
  const { api, scope, scopeKey, slot, locale, revoke } = input;
  const [options, setOptions] = useState<InvestigationLiveOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<readonly MemberPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [retained, setRetained] = useState<InvestigationSelectorOption | null>(null);
  const memberController = useRef<AbortController | null>(null);
  const filterControllers = useRef(new Set<AbortController>());
  const memberEpoch = useRef(0);
  const memberReadLock = useRef(false);
  const resetProtected = useCallback(() => {
    memberController.current?.abort();
    for (const controller of filterControllers.current) controller.abort();
    filterControllers.current.clear();
    memberEpoch.current += 1;
    memberReadLock.current = false;
    setOptions(null);
    setError(null);
    setPages([]);
    setPageIndex(0);
    setRetained(null);
    setMemberBusy(false);
    setMemberError(null);
  }, []);
  const reconcileSelectors = useCallback(() => {
    resetProtected();
    revoke();
  }, [resetProtected, revoke]);
  useEffect(() => {
    const controller = new AbortController();
    const activeFilters = filterControllers.current;
    activeFilters.add(controller);
    memberController.current?.abort();
    memberEpoch.current += 1;
    void readLiveSelectorOptions({ api, scope, signal: controller.signal,
      onAuthReconciled: () => { controller.abort(); reconcileSelectors(); } },
      scopeKey, () => !controller.signal.aborted)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setError(null);
          setOptions(loaded);
        }
      }).catch((problem: unknown) => {
        if (!controller.signal.aborted) {
          if (reconcileInvestigationAuthorization(problem, reconcileSelectors)) return;
          else setError(liveInvestigationError(locale, problem));
        }
      });
    return () => {
      controller.abort();
      activeFilters.delete(controller);
      memberController.current?.abort();
    };
  }, [api, scope, scopeKey, locale, reconcileSelectors]);

  useEffect(() => {
    if (!slot) return;
    const controller = new AbortController();
    const activeFilters = filterControllers.current;
    activeFilters.add(controller);
    void readInvestigationSearchFilters({ api, scope, signal: controller.signal,
      onAuthReconciled: () => { controller.abort(); reconcileSelectors(); } },
      { kind: "KEY_SLOT", text: slot, limit: 20 })
      .then((response) => {
        if (controller.signal.aborted) return;
        setOptions((current) => current?.scopeKey === scopeKey ? {
          ...current,
          slots: response.items.map((item) => selectorLabel(item.id, item.currentLabel.value)),
          slotOptionsComplete: !response.hasMore && response.nextCursor === null,
          slotQuery: slot,
        } : current);
      }).catch((problem: unknown) => {
        if (!controller.signal.aborted) {
          if (reconcileInvestigationAuthorization(problem, reconcileSelectors)) return;
          else setError(liveInvestigationError(locale, problem));
        }
      });
    return () => { controller.abort(); activeFilters.delete(controller); };
  }, [api, scope, scopeKey, slot, locale, reconcileSelectors]);

  const readPage = useCallback(async (prefix: string, cursor: string | null,
    replace: boolean) => {
    memberController.current?.abort();
    const controller = new AbortController();
    memberController.current = controller;
    memberReadLock.current = true;
    const epoch = ++memberEpoch.current;
    setMemberBusy(true);
    setMemberError(null);
    try {
      const result = await readInvestigationMemberPage({ api, scope,
        signal: controller.signal, onAuthReconciled: () => {
          controller.abort(); reconcileSelectors();
        } }, prefix, cursor);
      if (controller.signal.aborted || memberEpoch.current !== epoch) return;
      const page: MemberPage = { prefix, cursor, ...result };
      setPages((current) => replace ? [page] : [...current, page]);
      setPageIndex((current) => replace ? 0 : current + 1);
    } catch (problem: unknown) {
      if (!controller.signal.aborted && memberEpoch.current === epoch) {
        if (reconcileInvestigationAuthorization(problem, reconcileSelectors)) return;
        const expiredCursor = cursor && problem instanceof DashboardApiError &&
          problem.status === 400 && problem.code === "REQUEST_INVALID";
        if (expiredCursor) { setPages([]); setPageIndex(0); }
        setMemberError(expiredCursor ? investigationFailureText(locale, "restart")
          : liveInvestigationError(locale, problem));
      }
    } finally {
      if (memberController.current === controller) memberReadLock.current = false;
      if (!controller.signal.aborted && memberEpoch.current === epoch) setMemberBusy(false);
    }
  }, [api, scope, locale, reconcileSelectors]);

  const refine = useCallback((prefix: string) => {
    memberController.current?.abort();
    memberReadLock.current = false;
    ++memberEpoch.current;
    setPages([]);
    setPageIndex(0);
    if (prefix.trim()) void readPage(prefix.trim(), null, true);
    else { setMemberBusy(false); setMemberError(null); }
  }, [readPage]);
  const page = pages[pageIndex] ?? null;
  const previous = useCallback(() => setPageIndex((index) => Math.max(0, index - 1)), []);
  const next = useCallback(() => {
    if (memberBusy || memberReadLock.current || !page) return;
    if (pageIndex + 1 < pages.length) {
      setPageIndex(pageIndex + 1);
    } else if (page.nextCursor) {
      void readPage(page.prefix, page.nextCursor, false);
    }
  }, [memberBusy, page, pageIndex, pages.length, readPage]);
  const visibleMembers = useMemo(() => {
    const memberOptions = options?.memberOptionsComplete
      ? options.members : page?.options ?? [];
    return retained && !memberOptions.some((item) => item.id === retained.id)
      ? [...memberOptions, retained] : memberOptions;
  }, [options, page, retained]);
  const retainMember = useCallback((id: string) => {
    if (!id) { setRetained(null); return; }
    const found = visibleMembers.find((item) => item.id === id);
    if (found) setRetained(found);
  }, [visibleMembers]);
  return {
    options, optionsError: error, memberOptions: visibleMembers, retainMember,
    memberOversized: options?.memberOptionsComplete === false,
    memberBusy, memberError, memberPage: pageIndex + 1,
    memberPrevious: previous, memberNext: next, memberRefine: refine,
    memberHasPrevious: pageIndex > 0,
    memberHasNext: pageIndex + 1 < pages.length || Boolean(page?.nextCursor),
    memberUnpaged: Boolean(page?.hasMore && !page.nextCursor && pageIndex + 1 === pages.length),
    resetMembers: () => { refine(""); setRetained(null); },
    resetProtected,
  };
}
