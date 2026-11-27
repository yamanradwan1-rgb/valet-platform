import { verifyCheckpoint } from "./rating-disposition-ledger-codec";
import {
  DispositionLedgerBlocked,
  type LedgerCheckpointAuthenticator,
  type SignedLedgerCheckpoint,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";

/** The caller's signed proof is insufficient without independently persisted high-water. */
export async function requireWitnessedCheckpoint(
  anchor: TrustedLedgerAnchor,
  checkpoint: SignedLedgerCheckpoint,
  verifier: Pick<LedgerCheckpointAuthenticator, "verify">,
): Promise<void> {
  let witness: SignedLedgerCheckpoint;
  try { witness = await anchor.witness.readMinimum(); }
  catch { throw new DispositionLedgerBlocked("LEDGER_UNAVAILABLE"); }
  await verifyCheckpoint(witness, verifier);
  if (witness.ledgerId !== checkpoint.ledgerId ||
      witness.epoch !== checkpoint.epoch ||
      witness.sequence < checkpoint.sequence ||
      (witness.sequence === checkpoint.sequence &&
       witness.headDigest !== checkpoint.headDigest))
    throw new DispositionLedgerBlocked("UNTRUSTED_CHECKPOINT");
}

/** Reconcile lost witness ACK by independent monotonic witness readback. */
export async function advanceWitnessedCheckpoint(
  anchor: TrustedLedgerAnchor,
  checkpoint: SignedLedgerCheckpoint,
  verifier: Pick<LedgerCheckpointAuthenticator, "verify">,
): Promise<void> {
  try {
    const expected = await anchor.witness.readMinimum();
    await verifyCheckpoint(expected, verifier);
    if (expected.sequence < checkpoint.sequence)
      await anchor.witness.conditionalAdvance(expected, checkpoint);
  }
  catch { /* Signed independent readback decides whether the ACK was lost. */ }
  await requireWitnessedCheckpoint(anchor, checkpoint, verifier);
}
