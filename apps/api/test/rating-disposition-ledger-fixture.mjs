import { generateKeyPairSync, sign, verify } from "node:crypto";

import {
  EMPTY_LEDGER_DIGEST,
  sealCheckpoint,
} from "../src/modules/guest-access/rating-disposition-ledger-codec.ts";

export const ledgerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const epoch = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const scope = Object.freeze({
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  visitId: "33333333-3333-4333-8333-333333333333",
  caseId: "44444444-4444-4444-8444-444444444444",
  approvalId: "55555555-5555-4555-8555-555555555555",
  commandId: "66666666-6666-4666-8666-666666666666",
  action: "ERASE",
});

export function intent(overrides = {}) {
  return {
    ...scope,
    eventId: "77777777-7777-4777-8777-777777777777",
    approvedBy: "operator.approver",
    approvedAt: "2026-11-27T16:00:00.000Z",
    validUntil: "2026-11-27T16:30:00.000Z",
    recordedAt: "2026-11-27T16:00:01.000Z",
    ...overrides,
  };
}

export function receipt(overrides = {}) {
  return {
    ...scope,
    eventId: "88888888-8888-4888-8888-888888888888",
    intentEventId: "77777777-7777-4777-8777-777777777777",
    executorId: "operator.executor",
    executedAt: "2026-11-27T16:00:03.000Z",
    outcome: "ERASED",
    recordedAt: "2026-11-27T16:00:04.000Z",
    ...overrides,
  };
}

export function testAuthenticator() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    keyId: "w4-nonproduction-inmemory-ed25519",
    async sign(message) {
      return sign(null, Buffer.from(message), privateKey).toString("base64url");
    },
    async verify(message, signatureValue, keyId) {
      return keyId === this.keyId &&
        verify(null, Buffer.from(message), publicKey,
          Buffer.from(signatureValue, "base64url"));
    },
  };
}

/** Never attach this double to deployment config or real storage. */
export class InMemoryUnqualifiedLedger {
  constructor(head) {
    this.head = structuredClone(head);
    this.events = [];
    this.failure = null;
  }
  async readHead() {
    if (this.failure === "HEAD_UNAVAILABLE") throw new Error("in-memory unavailable");
    return structuredClone(this.head);
  }
  async readEvents(first, last) {
    if (this.failure === "READ_UNAVAILABLE") throw new Error("in-memory unavailable");
    return structuredClone(this.events.filter(
      (e) => e.sequence >= first && e.sequence <= last));
  }
  async conditionalAppend(expected, event, next) {
    if (this.failure === "UNKNOWN_BEFORE") return "UNKNOWN";
    if (this.head.sequence !== expected.sequence ||
        this.head.headDigest !== expected.headDigest ||
        this.head.epoch !== expected.epoch) return "CONFLICT";
    if (this.failure !== "LIE_ABOUT_COMMIT") {
      this.events.push(structuredClone(event));
      this.head = structuredClone(next);
    }
    if (this.failure === "UNKNOWN_AFTER") return "UNKNOWN";
    return "COMMITTED";
  }
}

export async function fixture() {
  const crypt = testAuthenticator();
  const genesis = await sealCheckpoint({
    version: 1, ledgerId, epoch, sequence: 0,
    headDigest: EMPTY_LEDGER_DIGEST,
  }, crypt);
  const store = new InMemoryUnqualifiedLedger(genesis);
  const anchor = { ledgerId, epoch, minimum: genesis };
  return { crypt, store, anchor };
}
