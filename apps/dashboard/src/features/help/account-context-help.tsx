"use client";

import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ContextHelp } from "./context-help";
import type { ContextHelpKey } from "./context-help-registry";
import { useConnectedHelpFallback } from "./use-connected-help-fallback";

// Account and Help routes can mount without an operational Location provider.
export function AccountContextHelp({ helpKey }: { readonly helpKey: ContextHelpKey }) {
  const auth = useStaffAuth();
  const { locale } = useDashboardLocale();
  const returnFocusFallbackRef = useConnectedHelpFallback();
  return (
    <ContextHelp
      helpKey={helpKey}
      locale={locale}
      returnFocusFallbackRef={returnFocusFallbackRef}
      scopeIdentity={`${auth.identityGeneration}:${auth.sessionGeneration}`}
    />
  );
}
