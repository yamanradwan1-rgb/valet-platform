"use client";

import { useMemo, type RefObject } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { selectedScopeAuthorityKey } from "../../components/foundation/selected-scope-revalidation-policy";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ContextHelp } from "./context-help";
import type { ContextHelpKey } from "./context-help-registry";

/**
 * The caller MUST mount this inside its existing authorized section (never
 * in the shared shell). Scope identity only fences presentation lifecycle:
 * it does not grant access or cause permission/network reads.
 */
export function ScopedContextHelp({
  helpKey,
  returnFocusFallbackRef,
}: {
  readonly helpKey: ContextHelpKey;
  readonly returnFocusFallbackRef?: RefObject<HTMLElement | null> | undefined;
}) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  // A route-owned heading can detach together with the old help trigger.
  // Resolve an existing, connected control at cleanup time instead of
  // capturing an obsolete element. The shell topbar survives normal route
  // transitions; a newly mounted page control covers shell teardown.
  const connectedFallbackRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        if (typeof document === "undefined") return null;
        const candidates = document.querySelectorAll<HTMLElement>(
          ".topbar button:not([disabled]), main button:not([disabled]), " +
          "main input:not([disabled])",
        );
        return Array.from(candidates).find((element) =>
          element.isConnected && element.getClientRects().length > 0
        ) ?? null;
      },
    }),
    [],
  );
  const scopeIdentity = [
    helpKey,
    dashboard.identityGeneration,
    dashboard.sessionGeneration,
    dashboard.selectionRevision,
    selectedScopeAuthorityKey(dashboard.selectedScope),
  ].join(":");

  return (
    <ContextHelp
      helpKey={helpKey}
      locale={locale}
      scopeIdentity={scopeIdentity}
      returnFocusFallbackRef={returnFocusFallbackRef ?? connectedFallbackRef}
    />
  );
}
