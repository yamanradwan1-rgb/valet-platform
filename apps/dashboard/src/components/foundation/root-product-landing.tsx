"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
      <p className="muted">{unavailableLabel}</p>
    </Panel>
  );
}
