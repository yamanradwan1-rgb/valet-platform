import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runQuotaCapacityNegative, runQuotaConflictingFingerprint,
  runQuotaInterleaving, runR03UnboundDenials,
} from "./pg17-quota-race-controls.mjs";

// Explicit fixture-only test invocation. No CI, production, W9 or Prime reuse.
if (process.env.ISSUE416_W38_ACCEPTANCE_PG_PASSWORD === undefined) {
  throw new Error("W38_PG17_EXPLICIT_LOCAL_FIXTURE_AUTH_REQUIRED");
}

for (const direction of ["A-first", "B-first"]) {
  for (const outcome of ["C", "R", "D", "T"]) {
    test(`PG17 quota SQL ${direction} ${outcome} physical two-backend wait`, async () => {
      const result = await runQuotaInterleaving(direction, outcome);
      assert.equal(result.physicalWait, true);
      assert.equal(result.direction, direction);
      assert.equal(result.outcome, outcome);
      if (outcome === "T") assert.equal(result.sqlstate, "55P03");
      else assert.deepEqual([result.bundleCount, result.entryCount], [1, 4]);
    });
  }
  test(`PG17 quota SQL ${direction} conflicting fingerprint`, async () => {
    const result = await runQuotaConflictingFingerprint(direction);
    assert.equal(result.sqlstate, "23505");
    assert.equal(result.physicalWait, true);
  });
}

test("PG17 quota SQL target cap rejects fourth distinct operation", async () => {
  const result = await runQuotaCapacityNegative();
  assert.deepEqual(result, { committedReservations: 3, fourthSqlstate: "P0001" });
});

test("PG17 R03 unbound client and credential attempts both deny", async () => {
  const result = await runR03UnboundDenials();
  assert.deepEqual(result, {
    clientDenied: "42501", credentialDenied: "42501", persistentRows: 0,
  });
});
