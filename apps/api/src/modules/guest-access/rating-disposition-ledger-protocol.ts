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
  let events: readonly LedgerEvent[];
  try {
    head = await store.readHead();
    await verifyCheckpoint(anchor.minimum, verifier);
    await verifyCheckpoint(head, verifier);
    if (anchor.ledgerId !== head.ledgerId ||
        anchor.epoch !== head.epoch ||
        anchor.minimum.ledgerId !== head.ledgerId ||
        anchor.minimum.epoch !== head.epoch ||
        head.sequence < anchor.minimum.sequence) blocked("ROLLBACK");
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
  }
  if (head.headDigest !== previous ||
      (anchor.minimum.sequence === 0 &&
       anchor.minimum.headDigest !== EMPTY_LEDGER_DIGEST)) blocked("CHAIN_TAMPER");
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
  const history = await loadVerifiedLedger(store, crypt, anchor);
  if (history.events.some((event) => event.eventId === payload.eventId))
    blocked("DUPLICATE_COMMAND");
  if (payload.kind === "INTENT" &&
      history.events.some((event) =>
        event.kind === "INTENT" && event.commandId === payload.commandId))
    blocked("DUPLICATE_COMMAND");
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
  let result: "COMMITTED" | "CONFLICT" | "UNKNOWN";
  try {
    result = await store.conditionalAppend(history.checkpoint, event, next);
  } catch {
    return blocked("UNKNOWN_APPEND");
  }
  if (result === "UNKNOWN") blocked("UNKNOWN_APPEND");
  if (result !== "COMMITTED") blocked("APPEND_CONFLICT");
  // A store's bare COMMITTED word cannot replace an independently verified readback.
  const observed = await loadVerifiedLedger(store, crypt, anchor);
  if (observed.events[event.sequence - 1] === undefined ||
      ledgerEventDigest(observed.events[event.sequence - 1]!) !== next.headDigest)
    blocked("CHAIN_TAMPER");
  return { event, checkpoint: next };
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
  try {
    return await sql.applyVerifiedIntent(proof.event as LedgerEvent & { kind: "INTENT" });
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
        event.kind === "RECEIPT" && event.intentEventId === input.intentEventId))
    blocked("UNVERIFIED_SQL_RECEIPT");
  let committed = false;
  try { committed = await sql.confirmCommitted(input); }
  catch { /* DB unavailable or ambiguous: never append a success receipt. */ }
  if (!committed) blocked("UNVERIFIED_SQL_RECEIPT");
  return append(store, crypt, anchor, { ...input, kind: "RECEIPT" });
}
