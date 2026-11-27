// @ts-nocheck -- runtime-contract adversarial values intentionally violate TS.
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  appendDispositionIntent,
  appendDispositionReceipt,
  applyAfterDurableIntent,
  loadVerifiedLedger,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol.ts";
import { ledgerEventDigest } from "../src/modules/guest-access/rating-disposition-ledger-codec.ts";
import { fixture, intent, receipt } from "./rating-disposition-ledger-fixture.mjs";

const isBlocked = (reason) => (error) =>
  error?.name === "DispositionLedgerBlocked" && error.reason === reason;

test("signed immutable intent precedes SQL and independently checked SQL receipt", async () => {
  const { store, crypt, anchor } = await fixture();
  let sqlCalls = 0;
  let readbacks = 0;
  const p = await appendDispositionIntent(store, crypt, anchor, intent());
  assert.equal(p.event.sequence, 1);
  assert.equal(p.checkpoint.headDigest, ledgerEventDigest(p.event));
  assert.equal((await loadVerifiedLedger(store, crypt, anchor)).events.length, 1);
  assert.equal(await applyAfterDurableIntent(store, crypt, anchor, p, {
    async applyVerifiedIntent() { sqlCalls++; return "COMMITTED"; },
  }), "COMMITTED");
  assert.equal(sqlCalls, 1);
  const completed = await appendDispositionReceipt(store, crypt, anchor, receipt(), {
    async confirmCommitted() { readbacks++; return true; },
  });
  assert.equal(completed.event.kind, "RECEIPT");
  assert.equal(completed.event.sequence, 2);
  assert.equal(readbacks, 1);
  assert.equal((await loadVerifiedLedger(store, crypt, anchor)).events.length, 2);
  await assert.rejects(
    appendDispositionReceipt(store, crypt, anchor, receipt({
      eventId: "99999999-9999-4999-8999-999999999999",
    }), { confirmCommitted: async () => true }),
    isBlocked("UNVERIFIED_SQL_RECEIPT"),
  );
  assert.equal(store.events.length, 2);
});

test("unknown durable intent outcome fails closed; no SQL invoked", async () => {
  const { store, crypt, anchor } = await fixture();
  store.failure = "UNKNOWN_AFTER";
  await assert.rejects(appendDispositionIntent(store, crypt, anchor, intent()),
    isBlocked("UNKNOWN_APPEND"));
  assert.equal(store.events.length, 1);
  // Even though the fake store received the event, UNKNOWN is not an ACK and
  // callers get no VerifiedIntent proof to pass to the SQL adapter.
  const history = await loadVerifiedLedger(store, crypt, anchor);
  assert.equal(history.events[0].kind, "INTENT");
  assert.equal(history.events.length, 1);
});

test("lied committed ACK cannot authorize SQL when durable readback is missing", async () => {
  const { store, crypt, anchor } = await fixture();
  store.failure = "LIE_ABOUT_COMMIT";
  await assert.rejects(appendDispositionIntent(store, crypt, anchor, intent()),
    isBlocked("CHAIN_TAMPER"));
  assert.equal(store.events.length, 0);
});

test("no success receipt without committed SQL readback or with wrong case", async () => {
  const { store, crypt, anchor } = await fixture();
  const p = await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(
    appendDispositionReceipt(store, crypt, anchor, receipt(),
      { confirmCommitted: async () => false }),
    isBlocked("UNVERIFIED_SQL_RECEIPT"),
  );
  await assert.rejects(
    appendDispositionReceipt(store, crypt, anchor, receipt({
      caseId: "00000000-0000-4000-8000-000000000000",
    }), { confirmCommitted: async () => true }),
    isBlocked("UNVERIFIED_SQL_RECEIPT"),
  );
  assert.equal(await applyAfterDurableIntent(store, crypt, anchor, p, {
    applyVerifiedIntent: async () => { throw new Error("lost DB response"); },
  }), "UNKNOWN");
  assert.equal(store.events.length, 1);
});

test("two concurrent writers are serialized by conditional expected head", async () => {
  const { store, crypt, anchor } = await fixture();
  const second = intent({
    eventId: "aaaaaaaa-0000-4000-8000-000000000001",
    approvalId: "aaaaaaaa-0000-4000-8000-000000000002",
    commandId: "aaaaaaaa-0000-4000-8000-000000000003",
  });
  const outcomes = await Promise.allSettled([
    appendDispositionIntent(store, crypt, anchor, intent()),
    appendDispositionIntent(store, crypt, anchor, second),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((x) => x.status === "rejected").length, 1);
  assert.equal(store.events.length, 1);
  assert.equal((await loadVerifiedLedger(store, crypt, anchor)).checkpoint.sequence, 1);
});

test("no replay of commandId, including same intent with new event ID", async () => {
  const { store, crypt, anchor } = await fixture();
  await appendDispositionIntent(store, crypt, anchor, intent());
  await assert.rejects(appendDispositionIntent(store, crypt, anchor, intent({
    eventId: "aaaaaaaa-0000-4000-8000-000000000001",
  })), isBlocked("DUPLICATE_COMMAND"));
});

test("tampering, missing events, signer change and signed rollback are denied", async () => {
  const { store, crypt, anchor } = await fixture();
  const p = await appendDispositionIntent(store, crypt, anchor, intent());
  const trusted = { ...anchor, minimum: p.checkpoint };
  store.events[0].caseId = "99999999-9999-4999-8999-999999999999";
  await assert.rejects(loadVerifiedLedger(store, crypt, trusted),
    isBlocked("ROLLBACK"));
  store.events.length = 0;
  await assert.rejects(loadVerifiedLedger(store, crypt, trusted),
    isBlocked("CHAIN_GAP"));
  store.head = anchor.minimum; // old checkpoint is still SIGNED.
  await assert.rejects(loadVerifiedLedger(store, crypt, trusted),
    isBlocked("ROLLBACK"));
  store.head = { ...p.checkpoint, signature: "B".repeat(88) };
  await assert.rejects(loadVerifiedLedger(store, crypt, trusted),
    isBlocked("UNTRUSTED_CHECKPOINT"));
});

test("untrusted metadata cannot add text, hash, freeform fields or coerce values", async () => {
  const values = [
    { commentText: "private" }, { contentHash: "a".repeat(64) },
    { reason: "original comment" }, { approvedBy: ["operator.approver"] },
    { caseId: ["44444444-4444-4444-8444-444444444444"] },
    { approvedBy: 12345 }, { eventId: 999 },
    { recordedAt: "2026-11-27" },
  ];
  for (const mutation of values) {
    const { store, crypt, anchor } = await fixture();
    await assert.rejects(
      appendDispositionIntent(store, crypt, anchor, intent(mutation)),
      isBlocked("INVALID_METADATA"),
    );
    assert.equal(store.events.length, 0);
  }
});

test("checkpoint digest and signature reject coercion and unknown keys", async () => {
  const { store, crypt, anchor } = await fixture();
  store.head = { ...anchor.minimum, headDigest: ["0".repeat(64)] };
  await assert.rejects(loadVerifiedLedger(store, crypt, anchor),
    isBlocked("INVALID_METADATA"));
  store.head = { ...anchor.minimum, signature: ["A".repeat(90)] };
  await assert.rejects(loadVerifiedLedger(store, crypt, anchor),
    isBlocked("INVALID_METADATA"));
  store.head = { ...anchor.minimum, rogueMetadata: "text" };
  await assert.rejects(loadVerifiedLedger(store, crypt, anchor),
    isBlocked("INVALID_METADATA"));
});
