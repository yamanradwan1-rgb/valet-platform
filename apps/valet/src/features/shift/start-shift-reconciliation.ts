import type { OperationalScopeResolution } from "../staff-operational-context";

import type { StartShiftPhase } from "./start-shift-controller";

/**
 * VUI-011D reconciliation of an ambiguous Start Shift outcome.
 *
 * An uncertain intent (transport lost, server outcome unknown) is resolved
 * ONLY by an authoritative operational-context read proving an ACTIVE Shift
 * at the SAME retained target Location. That authoritative fact clears the
 * stale retry intent — without fabricating any mutation-success response.
 *
 * Deliberately NOT resolving (intent must survive untouched):
 * - a refresh or reconnect by itself;
 * - NO_ACTIVE_SHIFT results (absence of a shift is never mutation proof,
 *   mirroring the End Shift rule in DEC-066 §4);
 * - an ACTIVE Shift at an unrelated Location (the retained command must
 *   not be silently reclassified; an explicit retry surfaces the server's
 *   truthful ACTIVE_SHIFT_CONFLICT instead);
 * - ambiguous multi-shift contexts.
 */
export function shouldReconcileUncertainStart(
  phase: StartShiftPhase,
  resolution: OperationalScopeResolution,
): boolean {
  return (
    phase.kind === "uncertain" &&
    resolution.kind === "RESOLVED" &&
    resolution.scope.locationId === phase.targetLocationId
  );
}
