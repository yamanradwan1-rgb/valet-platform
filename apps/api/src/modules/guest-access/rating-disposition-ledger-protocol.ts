import {
  assertLedgerPayload,
  ledgerEventDigest,
  sealCheckpoint,
  verifyCheckpoint,
} from "./rating-disposition-ledger-codec";
import {
  DispositionLedgerBlocked,
  type CommittedDispositionReceiptReader,
  type AuthorizedNoOpInspector,
  type DispositionLedgerStore,
  type DispositionSqlApplier,
  type IntentInput,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type LedgerPayload,
  type NoOpInput,
  type ReceiptInput,
  type SignedLedgerCheckpoint,
  type TrustedLedgerAnchor,
} from "./rating-disposition-ledger-types";
import {
  advanceWitnessedCheckpoint,
  requireWitnessedCheckpoint,
} from "./rating-disposition-ledger-witness";
import {
  assertNoOpRelation,
  equalScope,
  equivalentPayload,
  priorProof,
} from "./rating-disposition-ledger-relations";
import {
  loadVerifiedLedger,
  type VerifiedLedgerHistory,
} from "./rating-disposition-ledger-verify";
import { verifyAuthorizedNoOpEvidence } from "./rating-disposition-ledger-noop";

export {
  loadVerifiedLedger,
  type VerifiedLedgerHistory,
} from "./rating-disposition-ledger-verify";

function blocked(reason: ConstructorParameters<typeof DispositionLedgerBlocked>[0]): never {
  throw new DispositionLedgerBlocked(reason);
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
    const prior = priorProof(history.events, payload);
    if (prior) {
      const checkpoint = await sealCheckpoint({
        version: 1, ledgerId: anchor.ledgerId, epoch: anchor.epoch,
        sequence: prior.sequence, headDigest: ledgerEventDigest(prior),
      }, crypt);
      await advanceWitnessedCheckpoint(anchor, checkpoint, crypt);
      await loadVerifiedLedger(store, crypt, anchor);
      return { event: prior, checkpoint };
    }
    if (payload.kind === "NOOP") {
      assertNoOpRelation(history.events, payload);
    }
    if (payload.kind === "RECEIPT") {
      const original = history.events.find((event) =>
      event.kind === "INTENT" && event.eventId === payload.intentEventId);
      if (!original || !equalScope(original, payload as unknown as LedgerEvent) ||
        (original.kind === "INTENT" &&
         (original.approvedBy === payload.executorId ||
          payload.executedAt < original.recordedAt)) ||
        history.events.some((event) =>
          (event.kind === "RECEIPT" || event.kind === "NOOP") &&
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

/** A no-op is a separate terminal ledger event, never a fabricated SQL
 * completion receipt. Direct generic ledger writes are private. */
export async function appendDispositionNoOp(
  store: DispositionLedgerStore, crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor, input: NoOpInput,
  inspector: AuthorizedNoOpInspector,
): Promise<DurableEventProof & { event: LedgerEvent & { kind: "NOOP" } }> {
  const payload = { ...input, kind: "NOOP" } as const;
  assertLedgerPayload(payload);
  const history = await loadVerifiedLedger(store, crypt, anchor);
  const original = history.events.find((event) =>
    event.kind === "INTENT" && event.eventId === input.intentEventId);
  if (!original || original.kind !== "INTENT")
    blocked("UNRESOLVED_INTENT");
  const prior = history.events.find((event) =>
    event.kind === "NOOP" && event.eventId === input.eventId);
  if (!prior) assertNoOpRelation(history.events, input);
  await verifyAuthorizedNoOpEvidence(original, input, inspector);
  return append(store, crypt, anchor, payload) as Promise<
    DurableEventProof & { event: LedgerEvent & { kind: "NOOP" } }>;
}

export async function applyAfterDurableIntent(
  store: DispositionLedgerStore, crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor, proof: DurableEventProof,
  sql: DispositionSqlApplier,
): Promise<"COMMITTED" | "UNKNOWN" | "DENIED" | "NO_RECORD_WAIT" | "EXPIRED"> {
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
  const terminalNoOp = history.events.some((event) =>
    event.kind === "NOOP" && event.intentEventId === typedIntent.eventId);
  if (terminalNoOp) return "DENIED";
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
        (event.kind === "RECEIPT" || event.kind === "NOOP") &&
        event.intentEventId === input.intentEventId &&
        (event.eventId !== input.eventId ||
         !equivalentPayload(event, { ...input, kind: "RECEIPT" }))))
    blocked("UNVERIFIED_SQL_RECEIPT");
  let committed = false;
  try {
    committed = await sql.confirmCommitted(
      intent as LedgerEvent & { kind: "INTENT" }, input);
  }
  catch { /* DB unavailable or ambiguous: never append a success receipt. */ }
  if (!committed) blocked("UNVERIFIED_SQL_RECEIPT");
  return append(store, crypt, anchor, { ...input, kind: "RECEIPT" });
}
