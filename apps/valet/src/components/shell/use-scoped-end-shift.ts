"use client";

import { useEffect, useRef, useState } from "react";

import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import { useEndShift } from "../../features/shift";
import {
  makeWorkspaceStamp,
  type WorkspaceIdentityInput,
} from "./employee-workspace";

interface ScopedEndShiftOptions {
  readonly identity: WorkspaceIdentityInput;
  readonly scope: ResolvedOperationalScope | null;
  readonly onAuthorizationLoss: () => Promise<void>;
  readonly onEnded: () => Promise<void>;
}

/**
 * Keep DEC-066 uncertain same-command recovery at app level while preventing
 * an A phase or result from being presented under an authoritative B header.
 */
export function useScopedEndShift(options: ScopedEndShiftOptions) {
  const { endShift, phase, resetEndShift, retryUncertain } = useEndShift({
    onAuthorizationLoss: () => {
      void options.onAuthorizationLoss();
    },
    onEnded: () => {
      void options.onEnded();
    },
  });
  const [owner, setOwner] = useState<{
    identityStamp: string;
    shiftId: string;
  } | null>(null);
  // Synchronous owner for same-render rapid submissions.
  const ownerRef = useRef(owner);
  const identityStamp = makeWorkspaceStamp(options.identity);
  const resolvedShiftId = options.scope?.shiftId ?? null;

  useEffect(() => {
    resetEndShift();
    ownerRef.current = null;
  }, [
    resetEndShift,
    options.identity.authenticated,
    options.identity.identityGeneration,
  ]);

  useEffect(() => {
    const previousOwner = ownerRef.current;
    // A proven different active Shift retires A's transient command owner.
    // Null scope is deliberately not proof of End Shift success: A -> no
    // active Shift must retain the DEC-066 same-command retry route.
    if (
      resolvedShiftId !== null &&
      previousOwner?.identityStamp === identityStamp &&
      previousOwner.shiftId !== resolvedShiftId
    ) {
      resetEndShift();
      ownerRef.current = null;
    }
  }, [identityStamp, resolvedShiftId, resetEndShift]);

  const scopedPhase =
    owner?.identityStamp === identityStamp &&
    (options.scope === null || owner.shiftId === options.scope.shiftId)
      ? phase
      : { kind: "idle" as const };

  const submitForScope = (shiftId: string, cashReported: string): void => {
    if (options.scope?.shiftId !== shiftId) return;
    if (
      ownerRef.current?.identityStamp !== identityStamp ||
      ownerRef.current.shiftId !== shiftId
    ) {
      // A new explicit Shift command supersedes the former command owner.
      // EndShiftController.reset invalidates late network completions.
      resetEndShift();
    }
    const nextOwner = { identityStamp, shiftId };
    ownerRef.current = nextOwner;
    setOwner(nextOwner);
    endShift(shiftId, cashReported);
  };

  return {
    endShift: submitForScope,
    phase: scopedPhase,
    retryUncertain,
  };
}
