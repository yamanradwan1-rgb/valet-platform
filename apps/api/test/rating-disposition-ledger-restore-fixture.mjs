import {
  appendDispositionIntent,
  appendDispositionReceipt,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol.ts";
import { intent, receipt } from "./rating-disposition-ledger-fixture.mjs";

/** Strictly in-memory, not a storage or SQL provider qualification. */
export async function recordCompleted(
  store, crypt, anchor, action, outcome, suffix = "7", overrides = {},
) {
  const eventId = suffix.repeat(8) + "-7777-4777-8777-" + suffix.repeat(12);
  const receiptId = suffix.repeat(8) + "-8888-4888-8888-" + suffix.repeat(12);
  const approvalId = suffix.repeat(8) + "-5555-4555-8555-" + suffix.repeat(12);
  const commandId = suffix.repeat(8) + "-6666-4666-8666-" + suffix.repeat(12);
  await appendDispositionIntent(store, crypt, anchor, intent({
    action, eventId, approvalId, commandId, ...overrides,
  }));
  await appendDispositionReceipt(store, crypt, anchor, receipt({
    action, outcome, intentEventId: eventId, eventId: receiptId,
    approvalId, commandId, ...overrides,
  }), { confirmCommitted: async () => true });
}

export function fakeRestoreTarget() {
  const erased = new Set();
  const held = new Set();
  const calls = [];
  const key = (v) => v.organizationId + ":" + v.locationId + ":" + v.visitId;
  return {
    calls,
    async keepAllFeedbackTrafficClosed() { calls.push("QUARANTINE"); },
    async eraseTextAndKeepTombstone(v) {
      const k = key(v);
      calls.push("ERASE");
      if (erased.has(k)) return "ALREADY";
      erased.add(k);
      return "APPLIED";
    },
    async verifyTerminalErased(v) {
      calls.push("TOMBSTONE");
      return erased.has(key(v));
    },
    async suppressHeldText(v) {
      const k = key(v);
      calls.push("HOLD");
      if (held.has(k)) return "ALREADY";
      held.add(k);
      return "APPLIED";
    },
    async reconcileHeldPending(v) {
      calls.push("HELD_PENDING");
      return held.has(key(v)) ? "VERIFIED" : "UNKNOWN";
    },
    async reconcileHistoricalRelease() {
      calls.push("RELEASE");
      return "VERIFIED";
    },
    async verifyClosedNoRecord() {
      calls.push("NO_RECORD");
      return {
        exactCommittedCase: true,
        original24hWindowClosed: true,
        ratingAbsent: true,
      };
    },
    async verifyFencedNoOpClosure() {
      calls.push("NOOP_FENCE");
      return "VERIFIED";
    },
    async recomputeExpiredTextFromServerTime() {
      calls.push("EXPIRY");
      return "VERIFIED";
    },
    async verifyNoVisibleText(v) {
      calls.push("VERIFY");
      return erased.has(key(v)) || held.has(key(v));
    },
  };
}
