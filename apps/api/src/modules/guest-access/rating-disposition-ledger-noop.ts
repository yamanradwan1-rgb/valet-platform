import {
  DispositionLedgerBlocked,
  type AuthorizedNoOpInspector,
  type LedgerEvent,
  type NoOpInput,
} from "./rating-disposition-ledger-types";

/** Trust boundary: the separately authenticated, scoped, durable primary
 * inspector must prove both no committed outcome AND an execution fence.
 * The current W2 runtime A/E/R roles cannot issue this proof. */
export async function verifyAuthorizedNoOpEvidence(
  original: LedgerEvent & { kind: "INTENT" },
  input: NoOpInput,
  inspector: AuthorizedNoOpInspector,
): Promise<void> {
  if (inspector.inspectorId !== input.inspectorId)
    throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
  let evidence;
  try { evidence = await inspector.attestFencedNoOp(original, input); }
  catch { /* Unknown, including lost response, is never authorization. */ }
  const requiredBasis = {
    EXPIRED_UNAPPLIED: "EXPIRY_FENCED",
    DENIED_UNAPPLIED: "DENIAL_FENCED",
    CANCELLED_UNAPPLIED: "CANCELLATION_FENCED",
    SUPERSEDED_NO_RECORD: "SUCCESSOR_CLOSED_FENCED",
  } as const;
  if (!evidence ||
      evidence.approvalId !== original.approvalId ||
      evidence.commandId !== original.commandId ||
      evidence.organizationId !== original.organizationId ||
      evidence.locationId !== original.locationId ||
      evidence.visitId !== original.visitId ||
      evidence.caseId !== original.caseId ||
      evidence.action !== original.action ||
      evidence.approvedBy !== original.approvedBy ||
      evidence.approvedAt !== original.approvedAt ||
      evidence.validUntil !== original.validUntil ||
      evidence.inspectorId !== input.inspectorId ||
      evidence.observedAt !== input.observedAt ||
      evidence.reason !== input.reason ||
      evidence.basis !== requiredBasis[input.reason] ||
      evidence.noCommittedReceipt !== true ||
      evidence.futureExecutionFenced !== true)
    throw new DispositionLedgerBlocked("UNRESOLVED_INTENT");
}
