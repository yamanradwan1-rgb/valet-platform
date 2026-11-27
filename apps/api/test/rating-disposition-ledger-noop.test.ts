// @ts-nocheck -- invalid evidence and forged metadata are deliberate test inputs.
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  appendDispositionIntent, appendDispositionReceipt, appendDispositionNoOp,
  applyAfterDurableIntent, loadVerifiedLedger,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol.ts";
import {
  prepareQuarantinedRestore, replayInQuarantine,
} from "../src/modules/guest-access/rating-disposition-ledger-restore.ts";
import { fixture, intent, receipt } from "./rating-disposition-ledger-fixture.mjs";
import {
  expiredIntent, inspectorFor, noOpFrom,
} from "./rating-disposition-ledger-noop-fixture.mjs";
import {
  fakeRestoreTarget, recordCompleted,
} from "./rating-disposition-ledger-restore-fixture.mjs";

const denied = (reason) => (error) =>
  error?.name === "DispositionLedgerBlocked" && error.reason === reason;
const successorId = "99999999-7777-4777-8777-999999999999";

test("actual W2 NO_RECORD_WAIT has no SQL completion and blocks restore", async () => {
  const { store, crypt, anchor } = await fixture();
  const proof = await appendDispositionIntent(store, crypt, anchor, intent());
  const result = await applyAfterDurableIntent(store, crypt, anchor, proof, {
    lookupCommittedIntent: async () => "PENDING",
    applyVerifiedIntent: async () => "NO_RECORD_WAIT",
  });
  assert.equal(result, "NO_RECORD_WAIT");
  assert.equal((await loadVerifiedLedger(store, crypt, anchor)).events.length, 1);
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
  await assert.rejects(appendDispositionReceipt(
    store, crypt, anchor, receipt({ outcome: "NO_RECORD_WAIT" }),
    { confirmCommitted: async () => true }),
  denied("INVALID_METADATA"));
});

test("expired no-receipt approval can be closed only with fenced exact evidence", async () => {
  const { store, crypt, anchor } = await fixture();
  const original = await appendDispositionIntent(
    store, crypt, anchor, expiredIntent());
  const closure = noOpFrom(original.event);
  const proof = await appendDispositionNoOp(
    store, crypt, anchor, closure, inspectorFor(original.event));
  assert.equal(proof.event.kind, "NOOP");
  assert.equal(proof.event.reason, "EXPIRED_UNAPPLIED");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.verifiedNoOps.length, 1);
  assert.equal(plan.terminalErases.length, 0);
  assert.equal(plan.closedNoRecords.length, 0);
  const target = fakeRestoreTarget();
  assert.deepEqual(await replayInQuarantine(store, crypt, anchor, target),
    { replayVerified: true, admission: "DENY" });
  assert.ok(target.calls.includes("NOOP_FENCE"));
  const failed = fakeRestoreTarget();
  failed.verifyFencedNoOpClosure = async () => "UNKNOWN";
  await assert.rejects(replayInQuarantine(store, crypt, anchor, failed),
    denied("UNRESOLVED_INTENT"));
  assert.equal(failed.calls.includes("EXPIRY"), false);
  assert.equal((await appendDispositionNoOp(
    store, crypt, anchor, closure, inspectorFor(original.event))).event.sequence,
  proof.event.sequence);
  assert.equal(store.events.length, 2);
});

test("exact later NO_RECORD_CLOSED supersedes earlier unreceipted WAIT only with proof", async () => {
  const { store, crypt, anchor } = await fixture();
  const original = await appendDispositionIntent(
    store, crypt, anchor, expiredIntent());
  await recordCompleted(store, crypt, anchor,
    "ERASE", "NO_RECORD_CLOSED", "9");
  await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
    denied("UNRESOLVED_INTENT"));
  const closure = noOpFrom(original.event, {
    reason: "SUPERSEDED_NO_RECORD",
    successorIntentEventId: successorId,
  });
  const proof = await appendDispositionNoOp(
    store, crypt, anchor, closure, inspectorFor(original.event));
  assert.equal(proof.event.reason, "SUPERSEDED_NO_RECORD");
  const plan = await prepareQuarantinedRestore(store, crypt, anchor);
  assert.equal(plan.closedNoRecords.length, 1);
  assert.equal(plan.verifiedNoOps.length, 1);
  const target = fakeRestoreTarget();
  assert.equal((await replayInQuarantine(
    store, crypt, anchor, target)).admission, "DENY");
  assert.deepEqual(target.calls, [
    "QUARANTINE", "NOOP_FENCE", "NO_RECORD", "EXPIRY", "QUARANTINE",
  ]);
  assert.equal((await applyAfterDurableIntent(
    store, crypt, anchor, original, {
      lookupCommittedIntent: async () => "PENDING",
      applyVerifiedIntent: async () => { throw Error("must not reapply"); },
    })), "DENIED");
});

test("no-op closure cannot cross tenant, case, approval or successor", async () => {
  for (const mutation of [
    { caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { successorIntentEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ]) {
    const { store, crypt, anchor } = await fixture();
    const original = await appendDispositionIntent(
      store, crypt, anchor, expiredIntent());
    await recordCompleted(store, crypt, anchor,
      "ERASE", "NO_RECORD_CLOSED", "9");
    const closure = noOpFrom(original.event, {
      reason: "SUPERSEDED_NO_RECORD",
      successorIntentEventId: successorId,
      ...mutation,
    });
    await assert.rejects(appendDispositionNoOp(
      store, crypt, anchor, closure, inspectorFor(original.event)));
    assert.equal(store.events.length, 3);
  }
});

test("independently authenticated no-op evidence must attest exact approval", async () => {
  for (const changed of [
    { commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { approvedBy: "other.approver" },
    { approvedAt: "2026-01-01T00:00:00.000Z" },
    { validUntil: "2027-01-01T00:00:00.000Z" },
    { caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { futureExecutionFenced: false },
    { noCommittedReceipt: false },
    { basis: "DENIAL_FENCED" },
    { observedAt: "2026-01-01T00:00:00.000Z" },
  ]) {
    const { store, crypt, anchor } = await fixture();
    const original = await appendDispositionIntent(
      store, crypt, anchor, expiredIntent());
    await assert.rejects(appendDispositionNoOp(
      store, crypt, anchor, noOpFrom(original.event),
      inspectorFor(original.event, changed)),
    denied("UNRESOLVED_INTENT"));
    assert.equal(store.events.length, 1);
  }
});

test("approved cancellation is a signed no-op only after separately fenced evidence", async () => {
  const { store, crypt, anchor } = await fixture();
  const original = await appendDispositionIntent(store, crypt, anchor, intent());
  const closure = noOpFrom(original.event, { reason: "CANCELLED_UNAPPLIED" });
  await assert.rejects(appendDispositionNoOp(
    store, crypt, anchor, closure, {
      inspectorId: "foreign.inspector",
      attestFencedNoOp: async () => inspectorFor(original.event)
        .attestFencedNoOp(original.event, closure),
    }), denied("UNRESOLVED_INTENT"));
  const proof = await appendDispositionNoOp(
    store, crypt, anchor, closure, inspectorFor(original.event));
  assert.equal(proof.event.reason, "CANCELLED_UNAPPLIED");
  assert.equal((await prepareQuarantinedRestore(store, crypt, anchor))
    .verifiedNoOps.length, 1);
  assert.equal((await replayInQuarantine(
    store, crypt, anchor, fakeRestoreTarget())).admission, "DENY");
});

test("no-op evidence with a future expiry or wrong basis never passes", async () => {
  const { store, crypt, anchor } = await fixture();
  const original = await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(appendDispositionNoOp(
    store, crypt, anchor, noOpFrom(original.event),
    inspectorFor(original.event)), denied("CHAIN_TAMPER"));
  const close = noOpFrom(original.event, { reason: "DENIED_UNAPPLIED" });
  await assert.rejects(appendDispositionNoOp(
    store, crypt, anchor, close,
    inspectorFor(original.event, { basis: "EXPIRY_FENCED" })),
  denied("UNRESOLVED_INTENT"));
});

test("denial and unknown SQL response cannot become an unverified terminal event", async () => {
  for (const sqlStatus of ["DENIED", "UNKNOWN", "EXPIRED"]) {
    const { store, crypt, anchor } = await fixture();
    const original = await appendDispositionIntent(
      store, crypt, anchor, intent());
    assert.equal(await applyAfterDurableIntent(
      store, crypt, anchor, original, {
        lookupCommittedIntent: async () => "PENDING",
        applyVerifiedIntent: async () => sqlStatus,
      }), sqlStatus);
    const closure = noOpFrom(original.event, {
      reason: "DENIED_UNAPPLIED",
    });
    await assert.rejects(appendDispositionNoOp(
      store, crypt, anchor, closure, {
        attestFencedNoOp: async () => null,
      }), denied("UNRESOLVED_INTENT"));
    await assert.rejects(prepareQuarantinedRestore(store, crypt, anchor),
      denied("UNRESOLVED_INTENT"));
  }
});

test("signed NOOP cannot be followed by a synthetic committed SQL receipt", async () => {
  const { store, crypt, anchor } = await fixture();
  const original = await appendDispositionIntent(
    store, crypt, anchor, expiredIntent());
  await appendDispositionNoOp(store, crypt, anchor,
    noOpFrom(original.event), inspectorFor(original.event));
  await assert.rejects(appendDispositionReceipt(
    store, crypt, anchor, receipt(),
    { confirmCommitted: async () => true }),
  denied("UNVERIFIED_SQL_RECEIPT"));
  assert.equal(store.events.length, 2);
});
