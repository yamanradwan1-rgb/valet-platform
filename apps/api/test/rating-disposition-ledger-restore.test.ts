// @ts-nocheck -- tamper/unknown-outcome test doubles intentionally violate TS.
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  appendDispositionIntent,
  appendDispositionReceipt,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol.ts";
import {
  prepareQuarantinedRestore,
  replayInQuarantine,
} from "../src/modules/guest-access/rating-disposition-ledger-restore.ts";
import { fixture, intent, receipt, scope } from "./rating-disposition-ledger-fixture.mjs";

const denied = (reason) => (error) =>
  error?.name === "DispositionLedgerBlocked" && error.reason === reason;

async function recordCompleted(store, crypt, anchor, action, outcome, suffix = "7") {
  const eventId = suffix.repeat(8) + "-7777-4777-8777-" + suffix.repeat(12);
  const receiptId = suffix.repeat(8) + "-8888-4888-8888-" + suffix.repeat(12);
  const approvalId = suffix.repeat(8) + "-5555-4555-8555-" + suffix.repeat(12);
  const commandId = suffix.repeat(8) + "-6666-4666-8666-" + suffix.repeat(12);
  await appendDispositionIntent(store, crypt, anchor, intent({
    action, eventId, approvalId, commandId,
  }));
  await appendDispositionReceipt(store, crypt, anchor, receipt({
    action, outcome, intentEventId: eventId, eventId: receiptId,
    approvalId, commandId,
  }), { confirmCommitted: async () => true });
}

function fakeRestoreTarget() {
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
    async suppressHeldText(v) {
      const k = key(v);
      calls.push("HOLD");
      if (held.has(k)) return "ALREADY";
      held.add(k);
      return "APPLIED";
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

test("completed ERASE produces terminal replay; repeat remains idempotent and DENY", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "ERASED");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.admission, "DENY");
  assert.deepEqual(plan.terminalErases, [{
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    visitId: scope.visitId,
  }]);
  assert.deepEqual(plan.activeHolds, []);
  const target = fakeRestoreTarget();
  const first = await replayInQuarantine(plan, target);
  const second = await replayInQuarantine(plan, target);
  assert.deepEqual(first, { replayVerified: true, admission: "DENY" });
  assert.deepEqual(second, { replayVerified: true, admission: "DENY" });
  assert.deepEqual(target.calls, [
    "QUARANTINE", "ERASE", "VERIFY", "EXPIRY",
    "QUARANTINE", "ERASE", "VERIFY", "EXPIRY",
  ]);
});

test("a completed HOLD is suppressed but never authorizes serving text", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "HOLD", "HELD");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.activeHolds.length, 1);
  assert.equal(plan.terminalErases.length, 0);
  const target = fakeRestoreTarget();
  await replayInQuarantine(plan, target);
  assert.deepEqual(target.calls, ["QUARANTINE", "HOLD", "VERIFY", "EXPIRY"]);
});

test("unsigned/pending intent blocks the ENTIRE restore, not just the visit", async () => {
  const { store, crypt, anchor } = await fixture();
  await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("known HELD_PENDING and NO_RECORD_WAIT receipts also fail closed", async () => {
  for (const outcome of ["HELD_PENDING", "NO_RECORD_WAIT"]) {
    const { store, crypt, anchor } = await fixture();
    await recordCompleted(store, crypt, anchor, "ERASE", outcome);
    await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
      denied("UNRESOLVED_INTENT"));
  }
});

test("NO_RECORD_CLOSED cannot auto-authorize collection after old snapshot restore", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "NO_RECORD_CLOSED");
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("historical release requires current case/hold legal reconciliation", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "HOLD", "HELD", "7");
  await recordCompleted(store, crypt, anchor, "RELEASE", "RELEASED", "9");
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("foreign signed head, unavailable provider, truncation and old rollback deny replay", async () => {
  const { store, crypt, anchor } = await fixture();
  const proof = await appendDispositionIntent(store, crypt, anchor, intent());
  const floor = { ...anchor, minimum: proof.checkpoint };
  store.failure = "READ_UNAVAILABLE";
  await assert.rejects(prepareQuarantinedRestore(store, crypt, floor),
    denied("LEDGER_UNAVAILABLE"));
  store.failure = null;
  store.events.length = 0;
  await assert.rejects(prepareQuarantinedRestore(store, crypt, floor),
    denied("CHAIN_GAP"));
  store.head = anchor.minimum;
  await assert.rejects(prepareQuarantinedRestore(store, crypt, floor),
    denied("ROLLBACK"));
  store.head = { ...proof.checkpoint, epoch: "99999999-9999-4999-8999-999999999999" };
  await assert.rejects(prepareQuarantinedRestore(store, crypt, floor),
    denied("UNTRUSTED_CHECKPOINT"));
});

test("untrusted restored data, failure or unknown expiry keeps admission denied", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "ERASED");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  const target = fakeRestoreTarget();
  target.verifyNoVisibleText = async () => false;
  await assert.rejects(replayInQuarantine(plan, target),
    denied("UNRESOLVED_INTENT"));
  assert.equal(target.calls[0], "QUARANTINE");
  const expiring = fakeRestoreTarget();
  expiring.recomputeExpiredTextFromServerTime = async () => "UNKNOWN";
  await assert.rejects(replayInQuarantine(plan, expiring),
    denied("UNRESOLVED_INTENT"));
  const failing = fakeRestoreTarget();
  failing.eraseTextAndKeepTombstone = async () => { throw new Error("DB lost"); };
  await assert.rejects(replayInQuarantine(plan, failing),
    denied("LEDGER_UNAVAILABLE"));
});
