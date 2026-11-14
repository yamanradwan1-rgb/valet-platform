import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RACE_CASES,
  DIRECTIONS,
  OUTCOMES,
  GLOBAL_NEGATIVES,
  assertRaceMatrix,
  defineTrial,
  enumerateTrials,
  getRaceCase,
} from "./race-matrix.mjs";
import { ADMISSION_EXTRA_GATES } from "./race-cases-admission.mjs";
import { sourceOnlyRacePlan } from "./race-runner.mjs";

test("source-only enumeration covers all 21 exact cases in both directions", () => {
  assert.equal(assertRaceMatrix(), true);
  assert.deepEqual(
    RACE_CASES.map((row) => row.id),
    Array.from({ length: 21 }, (_, index) => index + 1),
  );
  assert.equal(RACE_CASES.filter((row) => row.admission).length, 6);
  assert.equal(enumerateTrials().length, 21 * 2 * 5);
  assert.equal(
    new Set(
      enumerateTrials().map(
        (trial) => `${trial.id}:${trial.direction}:${trial.outcome}`,
      ),
    ).size,
    210,
  );
});

test("each case requires all distinct C/R/D/U/T outcomes and reverse policy", () => {
  for (const { id, fence } of RACE_CASES) {
    assert.ok(fence.includes("0") || /1[0-6]/.test(fence));
    for (const direction of DIRECTIONS) {
      for (const outcome of OUTCOMES) {
        const trial = defineTrial(id, direction, outcome);
        assert.match(trial.expected, /\S/);
        assert.equal(trial.evidence, "PG17_NOT_RUN");
        if (direction === "B-first") {
          assert.ok(trial.reverseInvariant);
          if (outcome === "T") assert.match(trial.expected, /A times out/);
        } else {
          assert.equal(trial.reverseInvariant, null);
        }
      }
    }
  }
  assert.throws(() => getRaceCase(0), /UNKNOWN/);
  assert.throws(() => defineTrial(1, "A-first", "PASS"), /INVALID/);
});

test("admission cases contain the extra irreversible and ACL negative gates", () => {
  assert.ok(ADMISSION_EXTRA_GATES.length >= 10);
  assert.ok(GLOBAL_NEGATIVES.length >= 10);
  for (let id = 16; id <= 21; id++) {
    const trial = defineTrial(id, "A-first", "U");
    assert.equal(trial.mandatoryNegatives, ADMISSION_EXTRA_GATES);
  }
  assert.match(getRaceCase(21).name, /Shift force end/);
  assert.match(getRaceCase(15).committed, /COUNTED/);
  assert.match(getRaceCase(3).committed, /family/);
});

test("planning reports no real PostgreSQL success, despite 210 declarations", () => {
  const plan = sourceOnlyRacePlan();
  assert.equal(plan.status, "BLOCKED_PG17_NOT_RUN");
  assert.equal(plan.executed, 0);
  assert.equal(plan.pg17Passed, 0);
  assert.equal(plan.trials.length, 210);
});
