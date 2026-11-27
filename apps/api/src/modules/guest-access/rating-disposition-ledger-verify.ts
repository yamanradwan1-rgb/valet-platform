import {
  EMPTY_LEDGER_DIGEST,
  ledgerEventDigest,
  verifyCheckpoint,
} from "./rating-disposition-ledger-codec";
import {
  DispositionLedgerBlocked,
  type DispositionLedgerStore,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type SignedLedgerCheckpoint,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";
import {
  assertNoOpRelation,
  equalScope,
} from "./rating-disposition-ledger-relations";

export interface VerifiedLedgerHistory {
  readonly checkpoint: SignedLedgerCheckpoint;
  readonly events: readonly LedgerEvent[];
}

function blocked(reason: ConstructorParameters<typeof DispositionLedgerBlocked>[0]): never {
  throw new DispositionLedgerBlocked(reason);
}

/**
 * Complete signed chain verification with an independently maintained
 * monotone high-water witness. Do not trust a SQL-backup copy as the floor.
 */
export async function loadVerifiedLedger(
  store: DispositionLedgerStore,
  verifier: Pick<LedgerCheckpointAuthenticator, "verify">,
  anchor: TrustedLedgerAnchor,
): Promise<VerifiedLedgerHistory> {
  let head: SignedLedgerCheckpoint;
  let witnessed: SignedLedgerCheckpoint;
  let events: readonly LedgerEvent[];
  try {
    head = await store.readHead();
    witnessed = await anchor.witness.readMinimum();
    await verifyCheckpoint(anchor.minimum, verifier);
    await verifyCheckpoint(witnessed, verifier);
    await verifyCheckpoint(head, verifier);
    if (anchor.ledgerId !== head.ledgerId ||
        anchor.epoch !== head.epoch ||
        anchor.minimum.ledgerId !== head.ledgerId ||
        anchor.minimum.epoch !== head.epoch ||
        witnessed.ledgerId !== head.ledgerId ||
        witnessed.epoch !== head.epoch ||
        head.sequence < anchor.minimum.sequence ||
        head.sequence < witnessed.sequence ||
        witnessed.sequence < anchor.minimum.sequence ||
        (witnessed.sequence === anchor.minimum.sequence &&
         witnessed.headDigest !== anchor.minimum.headDigest)) blocked("ROLLBACK");
    events = await store.readEvents(1, head.sequence);
  } catch (error) {
    if (error instanceof DispositionLedgerBlocked) throw error;
    return blocked("LEDGER_UNAVAILABLE");
  }
  if (events.length !== head.sequence) blocked("CHAIN_GAP");

  const intents = new Map<string, LedgerEvent & { kind: "INTENT" }>();
  const resolved = new Set<string>();
  const ids = new Set<string>();
  const commands = new Set<string>();
  const approvals = new Set<string>();
  let previous = EMPTY_LEDGER_DIGEST;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.version !== 1 || event.ledgerId !== head.ledgerId ||
        event.epoch !== head.epoch || event.sequence !== index + 1 ||
        event.previousDigest !== previous) blocked("CHAIN_GAP");
    const currentDigest = ledgerEventDigest(event);
    if (ids.has(event.eventId)) blocked("CHAIN_TAMPER");
    ids.add(event.eventId);
    if (event.kind === "INTENT") {
      if (commands.has(event.commandId) || approvals.has(event.approvalId))
        blocked("DUPLICATE_COMMAND");
      commands.add(event.commandId);
      approvals.add(event.approvalId);
      intents.set(event.eventId, event);
    } else if (event.kind === "RECEIPT") {
      const intent = intents.get(event.intentEventId);
      if (!intent || resolved.has(event.intentEventId) ||
          !equalScope(intent, event) ||
          intent.approvedBy === event.executorId ||
          event.executedAt < intent.recordedAt) blocked("CHAIN_TAMPER");
      resolved.add(event.intentEventId);
    } else if (event.kind === "NOOP") {
      assertNoOpRelation(events.slice(0, index), event);
      resolved.add(event.intentEventId);
    } else {
      blocked("CHAIN_TAMPER");
    }
    previous = currentDigest;
    if (event.sequence === anchor.minimum.sequence &&
        currentDigest !== anchor.minimum.headDigest) blocked("ROLLBACK");
  }
  if (head.headDigest !== previous ||
      (anchor.minimum.sequence === 0 &&
       anchor.minimum.headDigest !== EMPTY_LEDGER_DIGEST)) blocked("CHAIN_TAMPER");
  const latestWitness = await anchor.witness.readMinimum().catch(() =>
    blocked("LEDGER_UNAVAILABLE"));
  await verifyCheckpoint(latestWitness, verifier);
  if (latestWitness.ledgerId !== head.ledgerId ||
      latestWitness.epoch !== head.epoch ||
      latestWitness.sequence < witnessed.sequence ||
      (latestWitness.sequence === witnessed.sequence &&
       latestWitness.headDigest !== witnessed.headDigest) ||
      latestWitness.sequence > head.sequence ||
      (latestWitness.sequence > 0 &&
       ledgerEventDigest(events[latestWitness.sequence - 1]!) !==
       latestWitness.headDigest) ||
      (witnessed.sequence > 0 &&
       ledgerEventDigest(events[witnessed.sequence - 1]!) !==
       witnessed.headDigest)) blocked("ROLLBACK");
  return { checkpoint: head, events };
}
