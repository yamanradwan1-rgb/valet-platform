"use client";

import type { JSX } from "react";

import type { StaffOperationalLocation } from "@valet/contracts";

import { EndShiftRecoveryPanel } from "./end-shift-recovery-panel";
import {
  EmployeeOperationalGate,
  type OperationalGateModel,
} from "./employee-operational-gate";
import type { EndShiftPhase, StartShiftPhase } from "../../features/shift";
import type { OperationalScopeResolution } from "../../features/staff-operational-context";
import { EmployeePushPermissionCard } from "./employee-push-permission-card";

export interface EmployeeOperationalScreenProps {
  readonly contextError: Error | null;
  readonly endShiftPhase: EndShiftPhase;
  /** True once the authoritative operational-context request has a body. */
  readonly hasContextResponse: boolean;
  readonly onDismissStartIntent: () => void;
  readonly onRefreshContext: () => void;
  readonly onRetryEndShift: () => void;
  readonly onRetryStartShift: () => void;
  readonly onSignOut: () => void;
  readonly onStartShift: (targetLocationId: string) => void;
  readonly resolution: OperationalScopeResolution;
  readonly startPhase: StartShiftPhase | null;
  readonly startableLocations: readonly StaffOperationalLocation[];
}

function resolveGateModel(
  contextError: Error | null,
  hasResponse: boolean,
  resolution: OperationalScopeResolution,
): OperationalGateModel {
  if (contextError !== null) {
    return { kind: "CONTEXT_ERROR", message: contextError.message };
  }
  if (!hasResponse) {
    return { kind: "LOADING" };
  }
  if (resolution.kind === "AMBIGUOUS_ACTIVE_SHIFTS") {
    return {
      count: resolution.count,
      kind: "AMBIGUOUS_ACTIVE_SHIFTS",
    };
  }
  return { kind: "NO_ACTIVE_SHIFT" };
}

/**
 * Authenticated Live app shell while no single active Shift is resolved.
 * DEC-066 §4: an uncertain End Shift outcome outranks the No Active Shift
 * gate — absence of an active shift is never mutation-success proof — and
 * VUI-011D offers Start Shift from authoritative Locations only.
 */
export function EmployeeOperationalScreen({
  contextError,
  endShiftPhase,
  hasContextResponse,
  onDismissStartIntent,
  onRefreshContext,
  onRetryEndShift,
  onRetryStartShift,
  onSignOut,
  onStartShift,
  resolution,
  startPhase,
  startableLocations,
}: EmployeeOperationalScreenProps): JSX.Element {
  if (endShiftPhase.kind === "uncertain") {
    return (
      <div className="min-h-screen bg-navy-2 flex items-center justify-center">
        <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
          <EmployeePushPermissionCard />
          <EndShiftRecoveryPanel
            onRetry={onRetryEndShift}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    );
  }

  const gateModel = resolveGateModel(
    contextError,
    hasContextResponse,
    resolution,
  );

  return (
    <div className="min-h-screen bg-navy-2 flex items-center justify-center">
      <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
        <EmployeePushPermissionCard />
        <EmployeeOperationalGate
          model={gateModel}
          onDismissStartIntent={onDismissStartIntent}
          onRetry={onRefreshContext}
          onRetryStart={onRetryStartShift}
          onSignOut={onSignOut}
          onStartShift={onStartShift}
          startPhase={startPhase}
          startableLocations={startableLocations}
        />
      </div>
    </div>
  );
}
