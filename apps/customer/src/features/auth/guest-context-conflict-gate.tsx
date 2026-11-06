'use client';

import React from 'react';

import { useGuestSession } from '../session/use-guest-session';
import { useGuestAuth } from './guest-auth-context';
import { OverlayGuestContextConflict } from './overlay-guest-context-conflict';

export function shouldShowGuestContextConflict(input: {
  readonly hasSession: boolean;
  readonly isExpired: boolean;
  readonly isSwitchOutcomeAmbiguous: boolean;
}): boolean {
  // A marker change can fence the old snapshot before an unknown switch is
  // reconciled. Keep the existing recovery action available in that case.
  return input.isSwitchOutcomeAmbiguous || (input.hasSession && !input.isExpired);
}

export function shouldPreserveAmbiguousGuestSnapshot(input: {
  readonly hasSession: boolean;
  readonly isSwitchOutcomeAmbiguous: boolean;
}): boolean {
  return input.hasSession && input.isSwitchOutcomeAmbiguous;
}

export function GuestContextConflictGate() {
  const {
    contextConflictScope,
    continueCurrentVisit,
    isContextSwitching,
    isContextSwitchOutcomeAmbiguous,
    openNewVisit,
  } = useGuestAuth();
  const { isExpired, session } = useGuestSession();

  if (contextConflictScope === null) return null;
  if (
    !shouldShowGuestContextConflict({
      hasSession: session !== null,
      isExpired,
      isSwitchOutcomeAmbiguous: isContextSwitchOutcomeAmbiguous,
    })
  ) {
    return null;
  }

  return (
    <OverlayGuestContextConflict
      open
      scope={contextConflictScope}
      isSwitching={isContextSwitching}
      isSwitchOutcomeAmbiguous={isContextSwitchOutcomeAmbiguous}
      onContinueCurrent={continueCurrentVisit}
      onOpenNew={() => void openNewVisit()}
    />
  );
}
