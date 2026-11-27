import {
  assertLedgerPayload,
  EMPTY_LEDGER_DIGEST,
  ledgerEventDigest,
  sealCheckpoint,
  verifyCheckpoint,
} from "./rating-disposition-ledger-codec";
import {
  DispositionLedgerBlocked,
  type CommittedDispositionReceiptReader,
  type DispositionLedgerStore,
  type DispositionSqlApplier,
  type IntentInput,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type LedgerPayload,
  type ReceiptInput,
  type SignedLedgerCheckpoint,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";
import {
  advanceWitnessedCheckpoint,
  requireWitnessedCheckpoint,
} from "./rating-disposition-ledger-witness";

export interface VerifiedLedgerHistory {
  readonly checkpoint: SignedLedgerCheckpoint;
  readonly events: readonly LedgerEvent[];
}

function blocked(reason: ConstructorParameters<typeof DispositionLedgerBlocked>[0]): never {
  throw new DispositionLedgerBlocked(reason);
}

function equalScope(a: LedgerEvent, b: LedgerEvent): boolean {
  return a.organizationId === b.organizationId &&
    a.locationId === b.locationId && a.visitId === b.visitId &&
    a.caseId === b.caseId && a.approvalId === b.approvalId &&
    a.commandId === b.commandId && a.action === b.action;
}

function equivalentPayload(event: LedgerEvent, payload: LedgerPayload): boolean {
  return event.kind === payload.kind && Object.entries(payload).every(
    ([key, value]) => (event as unknown as Record<string, unknown>)[key] === value,
  );
}

function priorProof(
  history: VerifiedLedgerHistory, payload: LedgerPayload,
): LedgerEvent | undefined {
  const prior = history.events.find((event) => event.eventId === payload.eventId);
  if (prior) {
    if (!equivalentPayload(prior, payload)) blocked("DUPLICATE_COMMAND");
    return prior;
  }
  if (payload.kind === "INTENT" && history.events.some((event) =>
    event.kind === "INTENT" && event.commandId === payload.commandId))
    blocked("DUPLICATE_COMMAND");
  if (payload.kind === "RECEIPT" && history.events.some((event) =>
    event.kind === "RECEIPT" && event.intentEventId === payload.intentEventId))
    blocked("UNVERIFIED_SQL_RECEIPT");
  return undefined;
}

/**
 * Full-chain verification is deliberately conservative. A future provider
 * adapter may offer independently verified range inclusion proofs instead.
 * Never accept a signature alone as proof that the head is not rolled back.
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
  const receipts = new Set<string>();
  const ids = new Set<string>();
  const commands = new Set<string>();
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
      if (commands.has(event.commandId)) blocked("DUPLICATE_COMMAND");
      commands.add(event.commandId);
      intents.set(event.eventId, event);
    } else {
      const intent = intents.get(event.intentEventId);
      if (!intent || receipts.has(event.intentEventId) ||
          !equalScope(intent, event) ||
          intent.approvedBy === event.executorId ||
          event.executedAt < intent.recordedAt) blocked("CHAIN_TAMPER");
      receipts.add(event.intentEventId);
    }
    previous = currentDigest;
    if (event.sequence === anchor.minimum.sequence &&
        currentDigest !== anchor.minimum.headDigest) blocked("ROLLBACK");
    // Re-reading the witness below also detects a late independently
    // advanced checkpoint before any commit authorization.
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

export interface DurableEventProof {
  readonly event: LedgerEvent;
  readonly checkpoint: SignedLedgerCheckpoint;
}

async function append(
  store: DispositionLedgerStore,
  crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor,
  payload: LedgerPayload,
): Promise<DurableEventProof> {
  assertLedgerPayload(payload);
  // Retry at most twice after a genuine CAS head race. Never assume a lost
  // network ACK means the object was not durably created.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const history = await loadVerifiedLedger(store, crypt, anchor);
    const prior = priorProof(history, payload);
    if (prior) {
      const checkpoint = await sealCheckpoint({
        version: 1, ledgerId: anchor.ledgerId, epoch: anchor.epoch,
        sequence: prior.sequence, headDigest: ledgerEventDigest(prior),
      }, crypt);
      await advanceWitnessedCheckpoint(anchor, checkpoint, crypt);
      await loadVerifiedLedger(store, crypt, anchor);
      return { event: prior, checkpoint };
    }
    if (payload.kind === "RECEIPT") {
      const original = history.events.find((event) =>
      event.kind === "INTENT" && event.eventId === payload.intentEventId);
      if (!original || !equalScope(original, payload as unknown as LedgerEvent) ||
        (original.kind === "INTENT" &&
         (original.approvedBy === payload.executorId ||
          payload.executedAt < original.recordedAt)) ||
        history.events.some((event) =>
          event.kind === "RECEIPT" &&
          event.intentEventId === payload.intentEventId))
        blocked("UNVERIFIED_SQL_RECEIPT");
    }
    const event: LedgerEvent = {
    version: 1, ledgerId: anchor.ledgerId, epoch: anchor.epoch,
    sequence: history.checkpoint.sequence + 1,
    previousDigest: history.checkpoint.headDigest, ...payload,
    };
    const next = await sealCheckpoint({
    version: 1, ledgerId: anchor.ledgerId, epoch: anchor.epoch,
    sequence: event.sequence, headDigest: ledgerEventDigest(event),
    }, crypt);
    let result: "COMMITTED" | "CONFLICT" | "UNKNOWN" = "UNKNOWN";
    try {
      result = await store.conditionalAppend(history.checkpoint, event, next);
    } catch { /* Treat thrown provider responses as unknown commits. */ }
    // On every result, independently verify the store and reconcile exact
    // event ID and full payload, including if another writer advanced the head.
    let observed: VerifiedLedgerHistory;
    try { observed = await loadVerifiedLedger(store, crypt, anchor); }
    catch { return blocked("UNKNOWN_APPEND"); }
    const committed = observed.events.find((item) => item.eventId === payload.eventId);
    if (committed) {
      if (!equivalentPayload(committed, payload) ||
          committed.sequence !== event.sequence ||
          ledgerEventDigest(committed) !== next.headDigest)
        blocked("CHAIN_TAMPER");
      // SQL remains prohibited until an independent high-water witness
      // acknowledged the exact metadata checkpoint, including unknown ACKs.
      await advanceWitnessedCheckpoint(anchor, next, crypt);
      await loadVerifiedLedger(store, crypt, anchor);
      return { event: committed, checkpoint: next };
    }
    if (result === "COMMITTED") blocked("CHAIN_TAMPER");
    if (result === "UNKNOWN") blocked("UNKNOWN_APPEND");
    // Provider proved that this CAS did not commit. A different command may
    // have won; rebase once the independently signed new head is verified.
  }
  return blocked("APPEND_CONFLICT");
}

/** Never call the SQL applier until this durable, verified result exists. */
export async function appendDispositionIntent(
  store: DispositionLedgerStore, crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor, input: IntentInput,
): Promise<DurableEventProof & { event: LedgerEvent & { kind: "INTENT" } }> {
  const proof = await append(store, crypt, anchor, { ...input, kind: "INTENT" });
  return proof as DurableEventProof & { event: LedgerEvent & { kind: "INTENT" } };
}

export async function applyAfterDurableIntent(
  store: DispositionLedgerStore, crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor, proof: DurableEventProof,
  sql: DispositionSqlApplier,
): Promise<"COMMITTED" | "UNKNOWN" | "DENIED"> {
  const history = await loadVerifiedLedger(store, crypt, anchor);
  const present = history.events[proof.event.sequence - 1];
  if (proof.event.kind !== "INTENT" || !present ||
      proof.checkpoint.ledgerId !== anchor.ledgerId ||
      proof.checkpoint.epoch !== anchor.epoch ||
      ledgerEventDigest(present) !== ledgerEventDigest(proof.event) ||
      proof.checkpoint.sequence !== proof.event.sequence ||
      proof.checkpoint.headDigest !== ledgerEventDigest(proof.event))
    blocked("UNTRUSTED_CHECKPOINT");
  await verifyCheckpoint(proof.checkpoint, crypt);
  await requireWitnessedCheckpoint(anchor, proof.checkpoint, crypt);
  const typedIntent = proof.event as LedgerEvent & { kind: "INTENT" };
  const completedInLedger = history.events.some((event) =>
    event.kind === "RECEIPT" && event.intentEventId === typedIntent.eventId);
  try {
    const committed = await sql.lookupCommittedIntent(typedIntent);
    if (committed === "UNKNOWN") return "UNKNOWN";
    if (completedInLedger && committed !== "COMMITTED") return "UNKNOWN";
    if (committed === "COMMITTED") return "COMMITTED";
    // Final expiry and identity/tenant/lock checks also belong to the
    // P-owned SQL function after locking: this is only an early rejection.
    if (Date.now() >= Date.parse(typedIntent.validUntil)) return "DENIED";
    return await sql.applyVerifiedIntent(typedIntent);
  } catch {
    return "UNKNOWN"; // Lost DB response is NOT evidence of an SQL commit.
  }
}

/** Independent completion only AFTER a committed, exact SQL receipt readback. */
export async function appendDispositionReceipt(
  store: DispositionLedgerStore, crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor, input: ReceiptInput,
  sql: CommittedDispositionReceiptReader,
): Promise<DurableEventProof> {
  assertLedgerPayload({ ...input, kind: "RECEIPT" });
  const history = await loadVerifiedLedger(store, crypt, anchor);
  const intent = history.events.find((event) =>
    event.kind === "INTENT" && event.eventId === input.intentEventId);
  if (!intent || !equalScope(intent, input as unknown as LedgerEvent) ||
      (intent.kind === "INTENT" && intent.approvedBy === input.executorId) ||
      history.events.some((event) =>
        event.kind === "RECEIPT" && event.intentEventId === input.intentEventId &&
        (event.eventId !== input.eventId ||
         !equivalentPayload(event, { ...input, kind: "RECEIPT" }))))
    blocked("UNVERIFIED_SQL_RECEIPT");
  let committed = false;
  try { committed = await sql.confirmCommitted(input); }
  catch { /* DB unavailable or ambiguous: never append a success receipt. */ }
  if (!committed) blocked("UNVERIFIED_SQL_RECEIPT");
  return append(store, crypt, anchor, { ...input, kind: "RECEIPT" });
}
