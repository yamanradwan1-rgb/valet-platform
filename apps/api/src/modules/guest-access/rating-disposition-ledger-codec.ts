import { createHash } from "node:crypto";

import {
  DispositionLedgerBlocked,
  type DispositionAction,
  type LedgerCheckpointAuthenticator,
  type LedgerEvent,
  type LedgerPayload,
  type SignedLedgerCheckpoint,
} from "./rating-disposition-ledger-types";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const actor = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const signature = /^[A-Za-z0-9_-]{16,2048}$/;
export const EMPTY_LEDGER_DIGEST = "0".repeat(64);

const scopeKeys = [
  "organizationId", "locationId", "visitId", "caseId",
  "approvalId", "commandId", "action",
];
const intentKeys = [
  ...scopeKeys, "kind", "eventId", "approvedBy", "approvedAt",
  "validUntil", "recordedAt",
];
const receiptKeys = [
  ...scopeKeys, "kind", "eventId", "intentEventId", "executorId",
  "executedAt", "outcome", "recordedAt",
];
const noOpKeys = [
  ...scopeKeys, "kind", "eventId", "intentEventId", "inspectorId",
  "observedAt", "reason", "successorIntentEventId", "recordedAt",
];
const eventKeys = [
  "version", "ledgerId", "epoch", "sequence", "previousDigest",
];
const checkpointKeys = [
  "version", "ledgerId", "epoch", "sequence",
  "headDigest", "keyId", "signature",
];

function deny(): never {
  throw new DispositionLedgerBlocked("INVALID_METADATA");
}

function exactKeys(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value) || Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))) deny();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) deny();
  if (Object.values(Object.getOwnPropertyDescriptors(value))
    .some((descriptor) => !Object.hasOwn(descriptor, "value"))) deny();
}

function validTime(value: unknown): boolean {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validScope(payload: LedgerPayload): void {
  for (const key of [
    "organizationId", "locationId", "visitId", "caseId",
    "approvalId", "commandId", "eventId",
  ] as const) {
    if (typeof payload[key] !== "string" || !uuid.test(payload[key])) deny();
  }
  if (!(["HOLD", "RELEASE", "ERASE"] as DispositionAction[])
    .includes(payload.action)) deny();
  if (!validTime(payload.recordedAt)) deny();
}

/** Never serialize unknown keys (including text, text hash or free-form reason). */
export function assertLedgerPayload(input: LedgerPayload): void {
  exactKeys(input, input.kind === "INTENT" ? intentKeys :
    input.kind === "RECEIPT" ? receiptKeys : noOpKeys);
  validScope(input);
  if (input.kind === "INTENT") {
    if (typeof input.approvedBy !== "string" || !actor.test(input.approvedBy) ||
        !validTime(input.approvedAt) || !validTime(input.validUntil) ||
        input.validUntil <= input.approvedAt ||
        input.recordedAt < input.approvedAt ||
        input.recordedAt >= input.validUntil) deny();
    return;
  }
  if (input.kind === "NOOP") {
    if (typeof input.intentEventId !== "string" ||
        !uuid.test(input.intentEventId) ||
        typeof input.inspectorId !== "string" || !actor.test(input.inspectorId) ||
        !validTime(input.observedAt) || input.recordedAt < input.observedAt ||
        !["EXPIRED_UNAPPLIED", "DENIED_UNAPPLIED",
          "CANCELLED_UNAPPLIED", "SUPERSEDED_NO_RECORD"]
          .includes(input.reason) ||
        (input.reason === "SUPERSEDED_NO_RECORD"
          ? typeof input.successorIntentEventId !== "string" ||
            !uuid.test(input.successorIntentEventId)
          : input.successorIntentEventId !== null)) deny();
    return;
  }
  if (input.kind !== "RECEIPT" ||
      typeof input.intentEventId !== "string" || !uuid.test(input.intentEventId) ||
      typeof input.executorId !== "string" || !actor.test(input.executorId) ||
      !validTime(input.executedAt) ||
      input.recordedAt < input.executedAt) deny();
  const outcomes: Record<DispositionAction, readonly string[]> = {
    HOLD: ["HELD"],
    RELEASE: ["RELEASED", "ERASED"],
    ERASE: ["ERASED", "HELD_PENDING", "NO_RECORD_CLOSED"],
  };
  if (!outcomes[input.action].includes(input.outcome)) deny();
}

export function assertLedgerEvent(event: LedgerEvent): void {
  exactKeys(event, [...eventKeys, ...(event.kind === "INTENT" ? intentKeys :
    event.kind === "RECEIPT" ? receiptKeys : noOpKeys)]);
  if (event.version !== 1 ||
      typeof event.ledgerId !== "string" || !uuid.test(event.ledgerId) ||
      typeof event.epoch !== "string" || !uuid.test(event.epoch) ||
      !Number.isSafeInteger(event.sequence) || event.sequence < 1 ||
      typeof event.previousDigest !== "string" ||
      !digest.test(event.previousDigest)) deny();
  const payload = { ...event } as Record<string, unknown>;
  for (const key of eventKeys) delete payload[key];
  assertLedgerPayload(payload as unknown as LedgerPayload);
}

export function canonicalEvent(event: LedgerEvent): string {
  assertLedgerEvent(event);
  const common = [
    "vaylet-rating-disposition-event-v1", event.version, event.ledgerId,
    event.epoch, event.sequence, event.previousDigest, event.kind,
    event.eventId, event.organizationId, event.locationId, event.visitId,
    event.caseId, event.approvalId, event.commandId, event.action,
    event.recordedAt,
  ];
  return JSON.stringify(event.kind === "INTENT"
    ? [...common, event.approvedBy, event.approvedAt, event.validUntil]
    : event.kind === "RECEIPT"
      ? [...common, event.intentEventId, event.executorId,
        event.executedAt, event.outcome]
      : [...common, event.intentEventId, event.inspectorId, event.observedAt,
        event.reason, event.successorIntentEventId]);
}

export function ledgerEventDigest(event: LedgerEvent): string {
  return createHash("sha256").update(canonicalEvent(event), "utf8").digest("hex");
}

export function checkpointPayload(cp: SignedLedgerCheckpoint): string {
  exactKeys(cp, checkpointKeys);
  if (cp.version !== 1 || typeof cp.ledgerId !== "string" ||
      !uuid.test(cp.ledgerId) ||
      typeof cp.epoch !== "string" || !uuid.test(cp.epoch) ||
      !Number.isSafeInteger(cp.sequence) || cp.sequence < 0 ||
      typeof cp.headDigest !== "string" || !digest.test(cp.headDigest) ||
      typeof cp.keyId !== "string" || !actor.test(cp.keyId) ||
      typeof cp.signature !== "string" || !signature.test(cp.signature)) deny();
  if (cp.sequence === 0 && cp.headDigest !== EMPTY_LEDGER_DIGEST) deny();
  return JSON.stringify([
    "vaylet-rating-disposition-checkpoint-v1", cp.version,
    cp.ledgerId, cp.epoch, cp.sequence, cp.headDigest, cp.keyId,
  ]);
}

export async function verifyCheckpoint(
  cp: SignedLedgerCheckpoint,
  verifier: Pick<LedgerCheckpointAuthenticator, "verify">,
): Promise<void> {
  const message = checkpointPayload(cp);
  if (!await verifier.verify(message, cp.signature, cp.keyId))
    throw new DispositionLedgerBlocked("UNTRUSTED_CHECKPOINT");
}

export async function sealCheckpoint(
  fields: Omit<SignedLedgerCheckpoint, "signature" | "keyId">,
  signer: LedgerCheckpointAuthenticator,
): Promise<SignedLedgerCheckpoint> {
  const unsigned = { ...fields, keyId: signer.keyId, signature: "A".repeat(16) };
  const message = checkpointPayload(unsigned);
  const signatureValue = await signer.sign(message);
  const sealed = { ...unsigned, signature: signatureValue };
  checkpointPayload(sealed);
  return sealed;
}
