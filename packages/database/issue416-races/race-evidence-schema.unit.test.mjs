import assert from "node:assert/strict";
import { test } from "node:test";

import { assertNoSecretEvidence } from "./race-phase-evidence.mjs";

test("closed evidence schema accepts only explicitly typed non-secret fields", () => {
  assert.equal(
    assertNoSecretEvidence({
      status: "BLOCKED_PG17_NOT_RUN",
      count: 210,
      caseId: 21,
      direction: "B-first",
      phase: "commit-sent",
      outcome: "U",
      event: "COMMIT_ACK_LOST",
      sqlstate: "57P01",
      serverCommitObserved: false,
      rollbackObserved: false,
      auditCount: 0,
      receiptCount: 0,
      namedFenceVerified: false,
    }),
    true,
  );
  assert.equal(assertNoSecretEvidence({ status: "BLOCKED", count: 0 }), true);
  assert.equal(
    assertNoSecretEvidence(Object.assign(Object.create(null), { caseId: 1 })),
    true,
  );
});

test("W25 P1: uppercase passwords and bearer-looking strings cannot masquerade as enums", () => {
  for (const [key, value] of [
    ["event", "PASSWORD123"],
    ["event", "SECRETB3ARER"],
    ["event", "VSA1"],
    ["event", "PASSWORD"],
    ["event", "password123"],
    ["event", "vsa1.abcdef"],
    ["event", "vsr1.abc123"],
    ["event", "3e5d2ab3-77a4-4ce8-8b14-561c079d8b3c"],
    ["event", "A".repeat(64)],
    ["status", "PASSWORD123"],
    ["outcome", "JWT"],
    ["phase", "SECRET"],
    ["sqlstate", "XK888"],
    ["direction", "PASSWORD123"],
  ]) {
    assert.throws(
      () => assertNoSecretEvidence({ [key]: value }),
      /UNREDACTED/,
      `${key}=${value}`,
    );
  }
});

test("arbitrary keys, nested payloads, credentials and accessors are fail-closed", () => {
  for (const sample of [
    { password: "PASSWORD123" },
    { rawToken: "vsa1.ABC" },
    { bearer: "abc" },
    { recovery_code: "CASESECRET" },
    { event: "COMMIT_ACK_LOST", evidence: "PASSWORD123" },
    { event: "COMMIT_OBSERVED", extra: "PASSWORD123" },
    { status: "BLOCKED", payload: { event: "COMMIT_OBSERVED" } },
    { status: "BLOCKED", event: ["COMMIT_OBSERVED"] },
    { count: "123456" },
    { count: 123456 },
    { count: -1 },
    { count: 0.5 },
    { caseId: 0 },
    { caseId: 22 },
    { rollbackObserved: "true" },
    { event: null },
    {},
    null,
    [],
    new Date(),
    Object.assign(Object.create(null), { [Symbol("concealed")]: "password" }),
  ]) {
    assert.throws(() => assertNoSecretEvidence(sample), /ISSUE416_RACE_/);
  }
  let getterCalled = false;
  const attacker = {};
  Object.defineProperty(attacker, "event", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "COMMIT_OBSERVED";
    },
  });
  assert.throws(() => assertNoSecretEvidence(attacker), /SCHEMA_INVALID/);
  assert.equal(getterCalled, false);
});
