import { loadVerifiedLedger } from "./rating-disposition-ledger-protocol";
import {
  DispositionLedgerBlocked,
  type DispositionLedgerStore,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type NoOpInput,
  type SignedLedgerCheckpoint,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";

export interface RestrictedVisit {
  readonly organizationId: string;
  readonly locationId: string;
  readonly visitId: string;
}

export interface CaseScopedVisit extends RestrictedVisit {
  readonly caseId: string;
  readonly approvalId: string;
}

export interface PendingHeldErase extends CaseScopedVisit {
  readonly holdCaseId: string;
}

export interface RestoreReplayPlan {
  /** Checkpoint is informational. The replay function never accepts a caller plan. */
  readonly checkpoint: SignedLedgerCheckpoint;
  readonly terminalErases: readonly CaseScopedVisit[];
  readonly activeHolds: readonly CaseScopedVisit[];
  readonly pendingHeldErases: readonly PendingHeldErase[];
  readonly releasedCases: readonly CaseScopedVisit[];
  readonly closedNoRecords: readonly CaseScopedVisit[];
  readonly verifiedNoOps: readonly (NoOpInput & { kind: "NOOP" })[];
  readonly admission: "DENY";
}

/**
 * The authorized P-side recovery adapter must operate on exact tenant, visit,
 * approval and case, and independently verify committed receipt and row state.
 * No method here can return permission to serve traffic.
 */
export interface QuarantinedRestoreTarget {
  keepAllFeedbackTrafficClosed(): Promise<void>;
  eraseTextAndKeepTombstone(visit: CaseScopedVisit):
    Promise<"APPLIED" | "ALREADY" | "UNKNOWN">;
  /** Exact SQL row proof: child state ERASED, comment NULL, tombstone and case receipt. */
  verifyTerminalErased(visit: CaseScopedVisit): Promise<boolean>;
  suppressHeldText(visit: CaseScopedVisit):
    Promise<"APPLIED" | "ALREADY" | "UNKNOWN">;
  reconcileHeldPending(visit: PendingHeldErase):
    Promise<"VERIFIED" | "UNKNOWN">;
  reconcileHistoricalRelease(visit: CaseScopedVisit):
    Promise<"VERIFIED" | "UNKNOWN">;
  verifyClosedNoRecord(visit: CaseScopedVisit): Promise<{
    readonly exactCommittedCase: boolean;
    readonly original24hWindowClosed: boolean;
    readonly ratingAbsent: boolean;
  }>;
  /** Re-evaluate approval, expiry, execution fence and original no-op
   * against the authorized source; a rolled-back DB snapshot is insufficient. */
  verifyFencedNoOpClosure(closure: NoOpInput):
    Promise<"VERIFIED" | "UNKNOWN">;
  recomputeExpiredTextFromServerTime(): Promise<"VERIFIED" | "UNKNOWN">;
  verifyNoVisibleText(visit: RestrictedVisit): Promise<boolean>;
}

interface VisitHistory {
  readonly scope: RestrictedVisit;
  erased: CaseScopedVisit | null;
  hold: CaseScopedVisit | null;
  pendingErase: PendingHeldErase | null;
  release: CaseScopedVisit | null;
  noRecordClosed: CaseScopedVisit | null;
}

function scoped(event: LedgerEvent): CaseScopedVisit {
  return {
    organizationId: event.organizationId,
    locationId: event.locationId,
    visitId: event.visitId,
    caseId: event.caseId,
    approvalId: event.approvalId,
  };
}

function key(event: LedgerEvent): string {
  return [event.organizationId, event.locationId, event.visitId].join(":");
}

function invalid(): never {
  throw new DispositionLedgerBlocked("CHAIN_TAMPER");
}

/** History verification includes complete chain, signature, witness and ACL-free metadata. */
export async function prepareQuarantinedRestore(
  store: DispositionLedgerStore,
  crypt: Pick<LedgerCheckpointAuthenticator, "verify">,
  anchor: TrustedLedgerAnchor,
): Promise<RestoreReplayPlan> {
  const history = await loadVerifiedLedger(store, crypt, anchor);
  const intents = new Map<string, LedgerEvent & { kind: "INTENT" }>();
  const resolved = new Set<string>();
  const noOps: (NoOpInput & { kind: "NOOP" })[] = [];
  const visits = new Map<string, VisitHistory>();
  for (const event of history.events) {
    if (event.kind === "INTENT") intents.set(event.eventId, event);
    else {
      resolved.add(event.intentEventId);
      if (event.kind === "NOOP") noOps.push(event);
    }
  }
  if (intents.size !== resolved.size)
    throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");

  for (const event of history.events) {
    if (event.kind !== "RECEIPT") continue;
    const intent = intents.get(event.intentEventId);
    if (!intent) invalid();
    const visitKey = key(event);
    const current = visits.get(visitKey) ?? {
      scope: scoped(event), erased: null, hold: null, pendingErase: null,
      release: null, noRecordClosed: null,
    };
    const scope = scoped(event);
    if (current.erased || current.noRecordClosed) invalid();
    switch (event.outcome) {
      case "HELD":
        if (current.hold) invalid();
        current.hold = scope;
        current.release = null;
        break;
      case "HELD_PENDING":
        if (!current.hold || current.pendingErase) invalid();
        current.pendingErase = { ...scope, holdCaseId: current.hold.caseId };
        break;
      case "RELEASED":
        if (!current.hold || current.hold.caseId !== intent.caseId ||
            current.pendingErase) invalid();
        current.hold = null;
        current.release = scope;
        break;
      case "ERASED":
        if (event.action === "RELEASE") {
          if (!current.hold || current.hold.caseId !== event.caseId) invalid();
        } else if (current.hold) invalid();
        current.erased = scope;
        current.hold = null;
        current.pendingErase = null;
        current.release = null;
        break;
      case "NO_RECORD_CLOSED":
        if (current.hold || current.release) invalid();
        current.noRecordClosed = scope;
        break;
      default:
        invalid();
    }
    visits.set(visitKey, current);
  }
  return {
    checkpoint: history.checkpoint,
    terminalErases: [...visits.values()].flatMap((v) => v.erased ? [v.erased] : []),
    activeHolds: [...visits.values()].flatMap((v) => v.hold ? [v.hold] : []),
    pendingHeldErases: [...visits.values()].flatMap((v) =>
      v.pendingErase ? [v.pendingErase] : []),
    releasedCases: [...visits.values()].flatMap((v) =>
      v.release ? [v.release] : []),
    closedNoRecords: [...visits.values()].flatMap((v) =>
      v.noRecordClosed ? [v.noRecordClosed] : []),
    verifiedNoOps: noOps,
    admission: "DENY",
  };
}

/**
 * Never accept a replay plan from a caller: derive it from the independently
 * signed ledger after closing all feedback traffic on the quarantined DB.
 * Operational admission remains DENY even when every reconciliation succeeds.
 */
export async function replayInQuarantine(
  store: DispositionLedgerStore,
  crypt: Pick<LedgerCheckpointAuthenticator, "verify">,
  anchor: TrustedLedgerAnchor,
  target: QuarantinedRestoreTarget,
): Promise<{ readonly replayVerified: true; readonly admission: "DENY" }> {
  try {
    await target.keepAllFeedbackTrafficClosed();
    const plan = await prepareQuarantinedRestore(store, crypt, anchor);
    for (const closure of plan.verifiedNoOps) {
      if (await target.verifyFencedNoOpClosure(closure) !== "VERIFIED")
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.terminalErases) {
      const result = await target.eraseTextAndKeepTombstone(visit);
      if (result === "UNKNOWN" || !await target.verifyTerminalErased(visit) ||
          !await target.verifyNoVisibleText(visit))
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.activeHolds) {
      const result = await target.suppressHeldText(visit);
      if (result === "UNKNOWN" || !await target.verifyNoVisibleText(visit))
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.pendingHeldErases) {
      if (await target.reconcileHeldPending(visit) !== "VERIFIED" ||
          !await target.verifyNoVisibleText(visit))
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.releasedCases) {
      if (await target.reconcileHistoricalRelease(visit) !== "VERIFIED")
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    for (const visit of plan.closedNoRecords) {
      const evidence = await target.verifyClosedNoRecord(visit);
      if (evidence.exactCommittedCase !== true ||
          evidence.original24hWindowClosed !== true ||
          evidence.ratingAbsent !== true)
        throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    }
    if (await target.recomputeExpiredTextFromServerTime() !== "VERIFIED")
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    // A new case during replay requires re-planning, not approval based on an old head.
    const latest = await loadVerifiedLedger(store, crypt, anchor);
    if (latest.checkpoint.ledgerId !== plan.checkpoint.ledgerId ||
        latest.checkpoint.epoch !== plan.checkpoint.epoch ||
        latest.checkpoint.sequence !== plan.checkpoint.sequence ||
        latest.checkpoint.headDigest !== plan.checkpoint.headDigest)
      throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
    await target.keepAllFeedbackTrafficClosed();
    return { replayVerified: true, admission: "DENY" };
  } catch (error) {
    if (error instanceof DispositionLedgerBlocked) throw error;
    throw new DispositionLedgerBlocked("LEDGER_UNAVAILABLE");
  }
}
