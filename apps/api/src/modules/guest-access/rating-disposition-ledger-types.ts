/** Issue #463 only: metadata, never a comment or a digest of a comment. */
export type DispositionAction = "HOLD" | "RELEASE" | "ERASE";
export type DispositionOutcome =
  | "HELD" | "RELEASED" | "ERASED" | "HELD_PENDING"
  | "NO_RECORD_WAIT" | "NO_RECORD_CLOSED";

export interface DispositionScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly visitId: string;
  readonly caseId: string;
  readonly approvalId: string;
  readonly commandId: string;
  readonly action: DispositionAction;
}

export interface IntentInput extends DispositionScope {
  readonly eventId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly validUntil: string;
  readonly recordedAt: string;
}

export interface ReceiptInput extends DispositionScope {
  readonly eventId: string;
  readonly intentEventId: string;
  readonly executorId: string;
  readonly executedAt: string;
  readonly outcome: DispositionOutcome;
  readonly recordedAt: string;
}

/** Durable non-erasure outcome. Never presented as SQL commit or erasure. */
export type NoOpReason =
  | "EXPIRED_UNAPPLIED" | "DENIED_UNAPPLIED"
  | "CANCELLED_UNAPPLIED" | "SUPERSEDED_NO_RECORD";
export interface NoOpInput extends DispositionScope {
  readonly eventId: string;
  readonly intentEventId: string;
  readonly inspectorId: string;
  readonly observedAt: string;
  readonly reason: NoOpReason;
  readonly successorIntentEventId: string | null;
  readonly recordedAt: string;
}

export type LedgerPayload =
  | (IntentInput & { readonly kind: "INTENT" })
  | (ReceiptInput & { readonly kind: "RECEIPT" })
  | (NoOpInput & { readonly kind: "NOOP" });

export type LedgerEvent = LedgerPayload & {
  readonly version: 1;
  readonly ledgerId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly previousDigest: string;
};

/** Signature covers every other field in this type, in canonical order. */
export interface SignedLedgerCheckpoint {
  readonly version: 1;
  readonly ledgerId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly headDigest: string;
  readonly keyId: string;
  readonly signature: string;
}

/** Implementations MUST attest independent durable conditional creation. */
export interface DispositionLedgerStore {
  readHead(): Promise<SignedLedgerCheckpoint>;
  conditionalAppend(
    expected: SignedLedgerCheckpoint,
    event: LedgerEvent,
    next: SignedLedgerCheckpoint,
  ): Promise<"COMMITTED" | "CONFLICT" | "UNKNOWN">;
  readEvents(firstSequence: number, lastSequence: number): Promise<readonly LedgerEvent[]>;
}

/** Provider-specific signer and independent verifier; no keys in this module. */
export interface LedgerCheckpointAuthenticator {
  readonly keyId: string;
  sign(canonicalPayload: string): Promise<string>;
  verify(canonicalPayload: string, signature: string, keyId: string): Promise<boolean>;
}

/** Independent trusted witness; not a checkpoint copied out of the SQL backup. */
export interface TrustedLedgerAnchor {
  readonly ledgerId: string;
  readonly epoch: string;
  readonly minimum: SignedLedgerCheckpoint;
  /** Independent signer/witness domain. Provider must attest monotonic CAS. */
  readonly witness: {
    readMinimum(): Promise<SignedLedgerCheckpoint>;
    /** Atomic compare-and-advance. Never regress or replace a signed fork. */
    conditionalAdvance(
      expected: SignedLedgerCheckpoint,
      next: SignedLedgerCheckpoint,
    ): Promise<"ADVANCED" | "CONFLICT" | "UNKNOWN">;
  };
}

/** This callback must read an already COMMITTED SQL receipt, not apply SQL. */
export interface CommittedDispositionReceiptReader {
  confirmCommitted(
    intent: LedgerEvent & { readonly kind: "INTENT" },
    input: ReceiptInput,
  ): Promise<boolean>;
}

/** The adapter is the only layer that may call the P-owned SQL function. */
export interface DispositionSqlApplier {
  /** Exact scoped committed P-owned approval receipt, read through authorized boundary. */
  lookupCommittedIntent(intent: LedgerEvent & { readonly kind: "INTENT" }):
    Promise<"COMMITTED" | "PENDING" | "UNKNOWN">;
  applyVerifiedIntent(intent: LedgerEvent & { readonly kind: "INTENT" }):
    Promise<"COMMITTED" | "UNKNOWN" | "DENIED" | "NO_RECORD_WAIT" | "EXPIRED">;
}

/** Result must be attested under an independent, scoped, concurrency-fenced
 * inspector. W2 E/A/R SQL roles cannot directly provide this authority. */
export interface FencedNoOpEvidence {
  readonly approvalId: string;
  readonly commandId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly visitId: string;
  readonly caseId: string;
  readonly action: DispositionAction;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly validUntil: string;
  readonly inspectorId: string;
  readonly observedAt: string;
  readonly reason: NoOpReason;
  readonly basis:
    | "EXPIRY_FENCED" | "DENIAL_FENCED"
    | "CANCELLATION_FENCED" | "SUCCESSOR_CLOSED_FENCED";
  readonly noCommittedReceipt: true;
  readonly futureExecutionFenced: true;
}

export interface AuthorizedNoOpInspector {
  /** Credential-bound principal; cannot be nominated by caller input. */
  readonly inspectorId: string;
  /** No reading from a rolled-back backup; must fence in-flight SQL execution. */
  attestFencedNoOp(
    intent: LedgerEvent & { readonly kind: "INTENT" },
    closure: NoOpInput,
  ): Promise<FencedNoOpEvidence | null>;
}

export class DispositionLedgerBlocked extends Error {
  constructor(readonly reason:
    | "INVALID_METADATA" | "UNTRUSTED_CHECKPOINT" | "ROLLBACK"
    | "CHAIN_GAP" | "CHAIN_TAMPER" | "DUPLICATE_COMMAND"
    | "UNRESOLVED_INTENT" | "UNKNOWN_APPEND" | "APPEND_CONFLICT"
    | "UNVERIFIED_SQL_RECEIPT" | "LEDGER_UNAVAILABLE") {
    super("Guest rating disposition ledger is unavailable.");
    this.name = "DispositionLedgerBlocked";
  }
}
