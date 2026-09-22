"use client";

import { useRef } from "react";

import type { DashboardMfaClient } from "../../lib/mfa/dashboard-mfa-client";
import { Button } from "../presentation/button";
import { AccountSecurityPanel } from "../security";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";

export function SelectedScopeMfaPanel({
  changeScopeLabel,
  client,
  generationKey,
  onAssured,
  onChangeScope,
}: {
  readonly changeScopeLabel: string;
  readonly client: DashboardMfaClient;
  readonly generationKey: string;
  readonly onAssured: () => void;
  readonly onChangeScope: () => void;
}) {
  const assuranceWasRequired = useRef(false);
  return (
    <StandaloneFoundationPanel>
      <AccountSecurityPanel
        client={client}
        key={generationKey}
        onStateChange={(state) => {
          if (state !== "ASSURED") {
            assuranceWasRequired.current = true;
          } else if (assuranceWasRequired.current) {
            assuranceWasRequired.current = false;
            onAssured();
          }
        }}
      />
      <Button onClick={onChangeScope} type="button" variant="secondary">
        {changeScopeLabel}
      </Button>
    </StandaloneFoundationPanel>
  );
}