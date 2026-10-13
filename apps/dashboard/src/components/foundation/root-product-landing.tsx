"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ContextHelp } from "../../features/help/context-help";
import helpSlot from "../../features/help/help-slot.module.css";
import { useConnectedHelpFallback } from "../../features/help/use-connected-help-fallback";

import {
  resolveRootProductLanding,
  type DashboardNavigationItem,
} from "../../lib/navigation";
import { Panel } from "../presentation/panel";
import { FoundationState } from "./foundation-state";

export function RootProductLanding({
  authorityKey,
  loadingLabel,
  navigation,
  navigationStatus,
  unavailableLabel,
}: {
  readonly authorityKey: string;
  readonly loadingLabel: string;
  readonly navigation: readonly DashboardNavigationItem[];
  readonly navigationStatus: "checking" | "error" | "valid";
  readonly unavailableLabel: string;
}) {
  const router = useRouter();
  const auth = useStaffAuth();
  const { locale } = useDashboardLocale();
  const returnFocusFallbackRef = useConnectedHelpFallback();
  const decision = resolveRootProductLanding(navigationStatus, navigation);
  const destination = decision.kind === "redirect" ? decision.href : null;

  useEffect(() => {
    if (destination === null) return;
    const frame = requestAnimationFrame(() => router.replace(destination));
    return () => cancelAnimationFrame(frame);
  }, [authorityKey, destination, router]);

  if (decision.kind !== "fallback") {
    return <FoundationState title="VAYLET" message={loadingLabel} />;
  }

  return (
    <Panel>
      <div className={helpSlot.heading}>
        <p className="muted">{unavailableLabel}</p>
        {navigationStatus === "valid" ? (
          <ContextHelp helpKey="workspace.page" locale={locale} returnFocusFallbackRef={returnFocusFallbackRef} scopeIdentity={`${authorityKey}:${auth.identityGeneration}:${auth.sessionGeneration}`} />
        ) : null}
      </div>
    </Panel>
  );
}
