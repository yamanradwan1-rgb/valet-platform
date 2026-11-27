import assert from "node:assert/strict";
import { test } from "vitest";

import {
  appendDispositionIntent,
  appendDispositionReceipt,
  applyAfterDurableIntent,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol";
import {
  APPLY_APPROVED_DISPOSITION_SQL,
  createDispositionSqlAdapter,
} from "../src/modules/guest-access/rating-disposition-sql-adapter";
import { fixture, intent, receipt } from "./rating-disposition-ledger-fixture.mjs";
import type { DispositionReceiptMetadata } from
  "../src/modules/guest-access/rating-disposition-sql-adapter";

async function setup() {
  const { store, crypt, anchor } = await fixture();
  const proof = await appendDispositionIntent(store, crypt, anchor, intent());
  const input = receipt();
  let applied = 0;
  const row: { -readonly [K in keyof DispositionReceiptMetadata]:
    DispositionReceiptMetadata[K] } = {
    approvalId: proof.event.approvalId,
    organizationId: proof.event.organizationId,
    locationId: proof.event.locationId,
    visitId: proof.event.visitId,
    caseId: proof.event.caseId,
    action: proof.event.action,
    approvedBy: proof.event.approvedBy,
    approvedAt: proof.event.approvedAt,
    validUntil: proof.event.validUntil,
    completedAt: null, executedBy: null, outcome: null,
  };
  const executor = {
    response: "ERASED",
    async executeCommitted(
      sql: typeof APPLY_APPROVED_DISPOSITION_SQL, params: readonly [string],
    ) {
      assert.equal(sql, APPLY_APPROVED_DISPOSITION_SQL);
      assert.deepEqual(params, [proof.event.approvalId]);
      applied += 1;
      if (this.response === "ERASED") {
        row.completedAt = input.executedAt;
        row.executedBy = input.executorId;
        row.outcome = "ERASED";
      }
      return { outcome: this.response };
    },
  };
  const inspector = {
    async readExactApproval(approvalId: string) {
      assert.equal(approvalId, proof.event.approvalId);
      return row;
    },
  };
  return {
    store, crypt, anchor, proof, input, row, executor, inspector,
    getApplied: () => applied,
  };
}

test("exact W2 SQL call follows durable witness; receipt is separately read back", async () => {
  const ctx = await setup();
  const adapter = createDispositionSqlAdapter(ctx.executor, ctx.inspector);
  assert.equal(await adapter.lookupCommittedIntent(ctx.proof.event), "PENDING");
  assert.equal(await applyAfterDurableIntent(
    ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), "COMMITTED");
  assert.equal(ctx.getApplied(), 1);
  const sealedReceipt = await appendDispositionReceipt(
    ctx.store, ctx.crypt, ctx.anchor, ctx.input, adapter);
  assert.equal(sealedReceipt.event.kind, "RECEIPT");
  assert.equal((await adapter.lookupCommittedIntent(ctx.proof.event)), "COMMITTED");
  assert.equal(await applyAfterDurableIntent(
    ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), "COMMITTED");
  assert.equal(ctx.getApplied(), 1);
});

test("foreign/malformed approval metadata denies SQL before E function", async () => {
  for (const patch of [
    { caseId: "00000000-0000-4000-8000-000000000000" },
    { organizationId: "00000000-0000-4000-8000-000000000000" },
    { action: "HOLD" },
    { approvedBy: "foreign-actor" },
    { approvedAt: "2026-01-01T00:00:00.000Z" },
    { completedAt: "bad", executedBy: "tamper", outcome: "ERASED" },
  ]) {
    const ctx = await setup();
    Object.assign(ctx.row, patch);
    const adapter = createDispositionSqlAdapter(ctx.executor, ctx.inspector);
    assert.equal(await applyAfterDurableIntent(
      ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), "UNKNOWN");
    assert.equal(ctx.getApplied(), 0);
  }
});

test("NO_RECORD_WAIT and EXPIRED have no completion receipt", async () => {
  for (const result of ["NO_RECORD_WAIT", "EXPIRED", "DENIED"]) {
    const ctx = await setup();
    ctx.executor.response = result;
    const adapter = createDispositionSqlAdapter(ctx.executor, ctx.inspector);
    assert.equal(await applyAfterDurableIntent(
      ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), result);
    assert.equal(ctx.getApplied(), 1);
    assert.equal(await adapter.confirmCommitted(ctx.proof.event, ctx.input), false);
  }
});

test("unknown SQL outcome, missing/foreign receipt and lost readback block closure", async () => {
  const ctx = await setup();
  ctx.executor.response = "UNRECOGNIZED";
  const adapter = createDispositionSqlAdapter(ctx.executor, ctx.inspector);
  assert.equal(await applyAfterDurableIntent(
    ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), "UNKNOWN");
  assert.equal(await adapter.confirmCommitted(ctx.proof.event, ctx.input), false);

  const another = await setup();
  const committed = createDispositionSqlAdapter(another.executor, another.inspector);
  await applyAfterDurableIntent(
    another.store, another.crypt, another.anchor, another.proof, committed);
  another.row.completedAt = "2026-11-01T00:00:00.000Z";
  assert.equal(await committed.confirmCommitted(another.proof.event, another.input), false);
  another.row.completedAt = another.input.executedAt;
  another.row.executedBy = "unrelated-executor";
  assert.equal(await committed.confirmCommitted(another.proof.event, another.input), false);
  another.row.executedBy = another.input.executorId;
  another.inspector.readExactApproval = async () => { throw new Error("db lost"); };
  assert.equal(await committed.confirmCommitted(another.proof.event, another.input), false);
});

test("committed receipt binds approver and approved/expiry times to signed INTENT", async () => {
  for (const mismatch of [
    { approvedBy: "other.privacy.approver" },
    { approvedAt: "2026-01-01T00:00:00.000Z" },
    { validUntil: "2027-01-01T00:00:00.000Z" },
  ]) {
    const ctx = await setup();
    const adapter = createDispositionSqlAdapter(ctx.executor, ctx.inspector);
    assert.equal(await applyAfterDurableIntent(
      ctx.store, ctx.crypt, ctx.anchor, ctx.proof, adapter), "COMMITTED");
    Object.assign(ctx.row, mismatch);
    assert.equal(await adapter.confirmCommitted(ctx.proof.event, ctx.input), false);
    await assert.rejects(appendDispositionReceipt(
      ctx.store, ctx.crypt, ctx.anchor, ctx.input, adapter),
    (error: unknown) =>
      error instanceof Error && "reason" in error &&
      error.reason === "UNVERIFIED_SQL_RECEIPT");
  }
});
