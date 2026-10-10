"use client";

import type { RefObject } from "react";

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
      returnFocusFallbackRef={returnFocusFallbackRef}
    />
  );
}
