import assert from "node:assert/strict";
import { test } from "vitest";

import {
  appendDispositionIntent,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol";
import {
  prepareQuarantinedRestore,
  replayInQuarantine,
} from "../src/modules/guest-access/rating-disposition-ledger-restore";
import { fixture, intent, scope } from "./rating-disposition-ledger-fixture.mjs";
import {
  fakeRestoreTarget,
  recordCompleted,
} from "./rating-disposition-ledger-restore-fixture.mjs";

const denied = (reason: string) => (error: unknown) =>
  error instanceof Error && error.name === "DispositionLedgerBlocked" &&
  "reason" in error && error.reason === reason;

test("completed ERASE produces terminal replay; repeat remains idempotent and DENY", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "ERASED");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.admission, "DENY");
  assert.deepEqual(plan.terminalErases, [{
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    visitId: scope.visitId,
    caseId: scope.caseId,
    approvalId: "77777777-5555-4555-8555-777777777777",
  }]);
  assert.deepEqual(plan.activeHolds, []);
  const target = fakeRestoreTarget();
  const first = await replayInQuarantine(store, crypt, anchor, target);
  const second = await replayInQuarantine(store, crypt, anchor, target);
  assert.deepEqual(first, { replayVerified: true, admission: "DENY" });
  assert.deepEqual(second, { replayVerified: true, admission: "DENY" });
  assert.deepEqual(target.calls, [
    "QUARANTINE", "ERASE", "TOMBSTONE", "VERIFY", "EXPIRY", "QUARANTINE",
    "QUARANTINE", "ERASE", "TOMBSTONE", "VERIFY", "EXPIRY", "QUARANTINE",
  ]);
});

test("a completed HOLD is suppressed but never authorizes serving text", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "HOLD", "HELD");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.activeHolds.length, 1);
  assert.equal(plan.terminalErases.length, 0);
  const target = fakeRestoreTarget();
  await replayInQuarantine(store, crypt, anchor, target);
  assert.deepEqual(target.calls, [
    "QUARANTINE", "HOLD", "VERIFY", "EXPIRY", "QUARANTINE",
  ]);
});

test("unsigned/pending intent blocks the ENTIRE restore, not just the visit", async () => {
  const { store, crypt, anchor } = await fixture();
  await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("NO_RECORD_WAIT without a later exact closure receipt fails closed", async () => {
  const { store, crypt, anchor } = await fixture();
  // Actual W2 returns this status without writing completed_at/outcome.
  await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("NO_RECORD_CLOSED only reconciles with actual closed 24h window and no row", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "NO_RECORD_CLOSED");
  const target = fakeRestoreTarget();
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.closedNoRecords.length, 1);
  assert.equal((await replayInQuarantine(store, crypt, anchor, target)).admission, "DENY");
  const pending = fakeRestoreTarget();
  pending.verifyClosedNoRecord = async () => ({
    exactCommittedCase: true, original24hWindowClosed: false, ratingAbsent: true,
  });
  await assert.rejects(replayInQuarantine(store, crypt, anchor, pending),
    denied("UNRESOLVED_INTENT"));
});

test("historical RELEASED resolves only under exact case and recovery SQL proof", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "HOLD", "HELD", "7");
  await recordCompleted(store, crypt, anchor, "RELEASE", "RELEASED", "9");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.releasedCases.length, 1);
  const target = fakeRestoreTarget();
  assert.equal((await replayInQuarantine(store, crypt, anchor, target)).admission, "DENY");
  assert.ok(target.calls.includes("RELEASE"));
  const unknown = fakeRestoreTarget();
  unknown.reconcileHistoricalRelease = async () => "UNKNOWN";
  await assert.rejects(replayInQuarantine(store, crypt, anchor, unknown),
    denied("UNRESOLVED_INTENT"));
});

test("HELD_PENDING remains suppressed and case-bound, then RELEASE ERASED is terminal", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "HOLD", "HELD", "7");
  await recordCompleted(store, crypt, anchor, "ERASE", "HELD_PENDING", "8", {
    caseId: "88888888-aaaa-4aaa-8aaa-888888888888",
  });
  const pendingPlan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(pendingPlan.activeHolds.length, 1);
  assert.equal(pendingPlan.pendingHeldErases.length, 1);
  assert.equal(pendingPlan.pendingHeldErases[0]?.holdCaseId, scope.caseId);
  const pendingTarget = fakeRestoreTarget();
  await replayInQuarantine(store, crypt, anchor, pendingTarget);
  assert.ok(pendingTarget.calls.includes("HELD_PENDING"));
  const noProof = fakeRestoreTarget();
  noProof.reconcileHeldPending = async () => "UNKNOWN";
  await assert.rejects(replayInQuarantine(store, crypt, anchor, noProof),
    denied("UNRESOLVED_INTENT"));

  await recordCompleted(store, crypt, anchor, "RELEASE", "ERASED", "9");
  const finalPlan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(finalPlan.terminalErases.length, 1);
  assert.equal(finalPlan.pendingHeldErases.length, 0);
  assert.equal(finalPlan.activeHolds.length, 0);
  assert.equal((await replayInQuarantine(
    store, crypt, anchor, fakeRestoreTarget())).admission, "DENY");
});

test("signed wrong-case release and ERASE while held cannot forge terminal state", async () => {
  const first = await fixture();
  await recordCompleted(first.store, first.crypt, first.anchor, "HOLD", "HELD");
  await recordCompleted(
    first.store, first.crypt, first.anchor, "RELEASE", "ERASED", "9",
    { caseId: "99999999-aaaa-4aaa-8aaa-999999999999" },
  );
  await assert.rejects(prepareQuarantinedRestore(
    first.store, first.crypt, first.anchor), denied("CHAIN_TAMPER"));

  const second = await fixture();
  await recordCompleted(second.store, second.crypt, second.anchor, "HOLD", "HELD");
  await recordCompleted(second.store, second.crypt, second.anchor,
    "ERASE", "ERASED", "9");
  await assert.rejects(prepareQuarantinedRestore(
    second.store, second.crypt, second.anchor), denied("CHAIN_TAMPER"));
});

test("later approved NO_RECORD_CLOSED alone cannot erase earlier missing receipt", async () => {
  const { store, crypt, anchor } = await fixture();
  await appendDispositionIntent(store, crypt, anchor, intent());
  await recordCompleted(store, crypt, anchor, "ERASE", "NO_RECORD_CLOSED", "9");
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
});

test("forged caller replay plan is never accepted as restore authority", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "ERASED");
  const forged = {
    terminalErases: [{ organizationId: scope.organizationId,
      locationId: scope.locationId, visitId: scope.visitId }],
    activeHolds: [], admission: "DENY",
  };
  const target = fakeRestoreTarget();
  await assert.rejects(replayInQuarantine(
    forged as unknown as Parameters<typeof replayInQuarantine>[0],
    crypt, anchor, target),
    denied("LEDGER_UNAVAILABLE"));
  assert.deepEqual(target.calls, ["QUARANTINE"]);
  const incomplete = fakeRestoreTarget();
  incomplete.verifyTerminalErased = async () => false;
  await assert.rejects(replayInQuarantine(
    store, crypt, anchor, incomplete), denied("UNRESOLVED_INTENT"));
});

test("new signed case during quarantine replay invalidates old checkpoint", async () => {
  const { store, crypt, anchor } = await fixture();
  await recordCompleted(store, crypt, anchor, "ERASE", "ERASED");
  const target = fakeRestoreTarget();
  const original = target.eraseTextAndKeepTombstone;
  target.eraseTextAndKeepTombstone = async (visit) => {
    const outcome = await original(visit);
    await appendDispositionIntent(store, crypt, anchor, intent({
      eventId: "aaaaaaaa-0000-4000-8000-000000000001",
      approvalId: "aaaaaaaa-0000-4000-8000-000000000002",
      commandId: "aaaaaaaa-0000-4000-8000-000000000003",
      visitId: "aaaaaaaa-0000-4000-8000-000000000004",
    }));
    return outcome;
  };
  await assert.rejects(replayInQuarantine(store, crypt, anchor, target),
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
  const target = fakeRestoreTarget();
  target.verifyNoVisibleText = async () => false;
  await assert.rejects(replayInQuarantine(store, crypt, anchor, target),
    denied("UNRESOLVED_INTENT"));
  assert.equal(target.calls[0], "QUARANTINE");
  const expiring = fakeRestoreTarget();
  expiring.recomputeExpiredTextFromServerTime = async () => "UNKNOWN";
  await assert.rejects(replayInQuarantine(store, crypt, anchor, expiring),
    denied("UNRESOLVED_INTENT"));
  const failing = fakeRestoreTarget();
  failing.eraseTextAndKeepTombstone = async () => { throw new Error("DB lost"); };
  await assert.rejects(replayInQuarantine(store, crypt, anchor, failing),
    denied("LEDGER_UNAVAILABLE"));
});
