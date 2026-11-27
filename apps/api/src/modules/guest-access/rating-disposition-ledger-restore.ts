import { loadVerifiedLedger } from "./rating-disposition-ledger-protocol";
import {
  DispositionLedgerBlocked,
  type DispositionLedgerStore,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";

export interface RestrictedVisit {
  readonly organizationId: string;
  readonly locationId: string;
  readonly visitId: string;
}

export interface RestoreReplayPlan {
  readonly terminalErases: readonly RestrictedVisit[];
  readonly activeHolds: readonly RestrictedVisit[];
  /** No operation from this plan is authority to open public/API traffic. */
  readonly admission: "DENY";
}

/** All calls must operate only against an independently quarantined restore. */
export interface QuarantinedRestoreTarget {
  keepAllFeedbackTrafficClosed(): Promise<void>;
  eraseTextAndKeepTombstone(visit: RestrictedVisit): Promise<"APPLIED" | "ALREADY" | "UNKNOWN">;
  suppressHeldText(visit: RestrictedVisit): Promise<"APPLIED" | "ALREADY" | "UNKNOWN">;
  recomputeExpiredTextFromServerTime(): Promise<"VERIFIED" | "UNKNOWN">;
  verifyNoVisibleText(visit: RestrictedVisit): Promise<boolean>;
}

function key(event: LedgerEvent): string {
  return [
    event.organizationId, event.locationId, event.visitId,
  ].join(":");
}

/** Requires the COMPLETE independently signed history, not DB-local receipts. */
export async function prepareQuarantinedRestore(
  store: DispositionLedgerStore,
  crypt: Pick<LedgerCheckpointAuthenticator, "verify">,
  anchor: TrustedLedgerAnchor,
): Promise<RestoreReplayPlan> {
  const history = await loadVerifiedLedger(store, crypt, anchor);
  const intents = new Map<string, LedgerEvent & { kind: "INTENT" }>();
  const receipts = new Map<string, LedgerEvent & { kind: "RECEIPT" }>();
  const visits = new Map<string, {
    scope: RestrictedVisit; erased: boolean; holdCaseId: string | null;
  }>();
  for (const event of history.events) {
    if (event.kind === "INTENT") {
      intents.set(event.eventId, event);
    } else {
      receipts.set(event.intentEventId, event);
    }
  }
  // A pending SQL outcome, lost receipt or incomplete approved HOLD is not
  // sufficient proof of erasure/release. Hold the ENTIRE restore admission.
  if (intents.size !== receipts.size)
    throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
  for (const event of history.events) {
    if (event.kind !== "RECEIPT") continue;
    const intent = intents.get(event.intentEventId)!;
    const visitKey = key(event);
    const previous = visits.get(visitKey);
    const state = previous ?? {
      scope: {
        organizationId: event.organizationId,
        locationId: event.locationId,
        visitId: event.visitId,
      },
      erased: false,
      holdCaseId: null,
    };
    if (state.erased && event.outcome !== "ERASED")
      throw new DispositionLedgerBlocked("CHAIN_TAMPER");
    if (event.outcome === "NO_RECORD_WAIT" ||
        event.outcome === "HELD_PENDING") {
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    if (event.outcome === "ERASED") {
      state.erased = true;
      state.holdCaseId = null;
    } else if (event.outcome === "HELD") {
      if (state.holdCaseId !== null)
        throw new DispositionLedgerBlocked("CHAIN_TAMPER");
      state.holdCaseId = event.caseId;
    } else if (event.outcome === "RELEASED") {
      if (state.holdCaseId !== intent.caseId)
        throw new DispositionLedgerBlocked("CHAIN_TAMPER");
      // A historical release is NOT current legal authority after restore.
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    } else if (event.outcome === "NO_RECORD_CLOSED") {
      // A rights case cannot certify the absence of a future/newer rating
      // without rechecking original 24h close and the restored visit.
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    visits.set(visitKey, state);
  }
  return {
    terminalErases: [...visits.values()].filter((v) => v.erased)
      .map((v) => v.scope),
    activeHolds: [...visits.values()].filter((v) =>
      !v.erased && v.holdCaseId !== null).map((v) => v.scope),
    admission: "DENY",
  };
}

/**
 * Fail-closed even on success: a qualified external restore controller must
 * separately verify legal holds, backup lifetime, operator identities and
 * release readiness. In-memory mocks NEVER authorize traffic.
 */
export async function replayInQuarantine(
  plan: RestoreReplayPlan, target: QuarantinedRestoreTarget,
): Promise<{ readonly replayVerified: true; readonly admission: "DENY" }> {
  await target.keepAllFeedbackTrafficClosed();
  try {
    for (const visit of plan.terminalErases) {
      const result = await target.eraseTextAndKeepTombstone(visit);
      if (result === "UNKNOWN" || !await target.verifyNoVisibleText(visit))
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.activeHolds) {
      const result = await target.suppressHeldText(visit);
      if (result === "UNKNOWN" || !await target.verifyNoVisibleText(visit))
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    if (await target.recomputeExpiredTextFromServerTime() !== "VERIFIED")
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    return { replayVerified: true, admission: "DENY" };
  } catch (error) {
    if (error instanceof DispositionLedgerBlocked) throw error;
    throw new DispositionLedgerBlocked("LEDGER_UNAVAILABLE");
  }
}
