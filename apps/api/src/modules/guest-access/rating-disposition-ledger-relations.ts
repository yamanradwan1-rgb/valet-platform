import {
  DispositionLedgerBlocked,
  type LedgerEvent,
  type LedgerPayload,
  type NoOpInput,
} from "./rating-disposition-ledger-types";

export function equalScope(a: LedgerEvent, b: LedgerPayload): boolean {
  return a.organizationId === b.organizationId &&
    a.locationId === b.locationId && a.visitId === b.visitId &&
    a.caseId === b.caseId && a.approvalId === b.approvalId &&
    a.commandId === b.commandId && a.action === b.action;
}

export function equivalentPayload(event: LedgerEvent, payload: LedgerPayload): boolean {
  return event.kind === payload.kind && Object.entries(payload).every(
    ([key, value]) => (event as unknown as Record<string, unknown>)[key] === value,
  );
}

/** A command ID is immutable; each intent has exactly one terminal event. */
export function priorProof(
  events: readonly LedgerEvent[], payload: LedgerPayload,
): LedgerEvent | undefined {
  const prior = events.find((event) => event.eventId === payload.eventId);
  if (prior) {
    if (!equivalentPayload(prior, payload))
      throw new DispositionLedgerBlocked("DUPLICATE_COMMAND");
    return prior;
  }
  if (payload.kind === "INTENT" && events.some((event) =>
    event.kind === "INTENT" &&
    (event.commandId === payload.commandId ||
     event.approvalId === payload.approvalId)))
    throw new DispositionLedgerBlocked("DUPLICATE_COMMAND");
  if (payload.kind !== "INTENT" && events.some((event) =>
    (event.kind === "RECEIPT" || event.kind === "NOOP") &&
    event.intentEventId === payload.intentEventId))
    throw new DispositionLedgerBlocked("UNVERIFIED_SQL_RECEIPT");
  return undefined;
}

function invalid(): never {
  throw new DispositionLedgerBlocked("CHAIN_TAMPER");
}

/** No-op is never a receipt. A successor must be an independently signed,
 * independently committed exact-case NO_RECORD_CLOSED record. */
export function assertNoOpRelation(
  preceding: readonly LedgerEvent[],
  closure: NoOpInput,
): void {
  const intent = preceding.find((event) =>
    event.kind === "INTENT" && event.eventId === closure.intentEventId);
  if (!intent || intent.kind !== "INTENT" ||
      !equalScope(intent, { ...closure, kind: "NOOP" }) ||
      closure.observedAt < intent.recordedAt ||
      closure.inspectorId === intent.approvedBy ||
      preceding.some((event) =>
        (event.kind === "RECEIPT" || event.kind === "NOOP") &&
        event.intentEventId === intent.eventId)) invalid();
  if (closure.reason === "EXPIRED_UNAPPLIED" ||
      closure.reason === "SUPERSEDED_NO_RECORD") {
    if (closure.observedAt < intent.validUntil) invalid();
  }
  if (closure.reason !== "SUPERSEDED_NO_RECORD") return;
  if (intent.action !== "ERASE" ||
      closure.successorIntentEventId === intent.eventId) invalid();
  const successor = preceding.find((event) =>
    event.kind === "INTENT" &&
    event.eventId === closure.successorIntentEventId);
  if (!successor || successor.kind !== "INTENT" ||
      successor.action !== "ERASE" ||
      successor.caseId !== intent.caseId ||
      successor.organizationId !== intent.organizationId ||
      successor.locationId !== intent.locationId ||
      successor.visitId !== intent.visitId ||
      successor.approvalId === intent.approvalId) invalid();
  const receipt = preceding.find((event) =>
    event.kind === "RECEIPT" &&
    event.intentEventId === successor.eventId);
  if (!receipt || receipt.kind !== "RECEIPT" ||
      receipt.outcome !== "NO_RECORD_CLOSED" ||
      closure.observedAt < receipt.executedAt) invalid();
}
