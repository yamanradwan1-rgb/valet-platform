"use client";

import { Button } from "../presentation/button";
import { AccountSecurityStandalone } from "../security";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";

export function SelectedScopeMfaPanel({
  changeScopeLabel,
  generationKey,
  onAssured,
  onChangeScope,
}: {
  readonly changeScopeLabel: string;
  readonly generationKey: string;
  readonly onAssured: () => void;
  readonly onChangeScope: () => void;
}) {
  return (
    <StandaloneFoundationPanel>
      <AccountSecurityStandalone
        key={generationKey}
        generationKey={generationKey}
        onAssured={onAssured}
      />
      <Button onClick={onChangeScope} type="button" variant="secondary">
        {changeScopeLabel}
      </Button>
    </StandaloneFoundationPanel>
  );
}
