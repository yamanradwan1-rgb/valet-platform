import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { oneSidedUpper95, pairedBlockIntervals, quantile } from "./issue429-qa-statistics.mjs";
import { analyzeNowait, qualifyIssue429 } from "./issue429-qa-qualification.mjs";

const registration = JSON.parse(readFileSync(new URL(
  "./issue429-qa-preregister.json", import.meta.url), "utf8"));

function oracle(outcome, eligibleWithHeadroom = true) {
  return {
    outcome,
    allowedLatencyMs: 12,
    oracle: {
      method: "independent-committed-ledger",
      eligibilityVerified: true,
      capacityVerified: true,
      orderedAgainstCommits: true,
      eligibleWithHeadroom,
    },
  };
}

function observed(count) {
  return {
    committedAdmissions: count, globalSpentDelta: count,
    sumTenantSpentDeltas: count, independentMockReceives: count,
  };
}

test("default preregistration explicitly refuses a performance PASS", () => {
  assert.equal(registration.approval.approved, false);
  assert.equal(registration.approval.workloads.peak.registered, false);
  assert.equal(qualifyIssue429(registration, {}).status, "INCONCLUSIVE");
});

test("paired bootstrap compares successful requests in paired blocks", () => {
  const blocks = Array.from({ length: 10 }, (_, index) => ({
    baselineMs: [100 + index, 150 + index, 240 + index, 320 + index],
    candidateMs: [90 + index, 140 + index, 230 + index, 310 + index],
  }));
  const intervals = pairedBlockIntervals(blocks, { iterations: 999, seed: 71 });
  assert.deepEqual(intervals.map((item) => item.percentile), [50, 95, 99]);
  for (const interval of intervals) {
    assert.ok(interval.simultaneousUpper95Ms < 0);
    assert.ok(interval.differenceMs < 0);
  }
  const worse = blocks.map((b) => ({
    baselineMs: b.baselineMs,
    candidateMs: b.baselineMs.map((value) => value + 20),
  }));
  assert.ok(pairedBlockIntervals(worse, { iterations: 999, seed: 71 })
    .every((interval) => interval.simultaneousLower95Ms > 0));
});

test("one-sided upper bound is nonzero even after zero observed denials", () => {
  const bound = oneSidedUpper95(0, 1000);
  assert.ok(bound.upper > 0.0029 && bound.upper < 0.0031);
  assert.ok(oneSidedUpper95(1, 1000).upper > bound.upper);
  assert.throws(() => oneSidedUpper95(0, 0), /Invalid independent/);
});

test("NOWAIT zero eligible-denial passes only approved sample and independent oracle", () => {
  const blocks = Array.from({ length: 10 }, () => ({
    attempts: Array.from({ length: 10 }, () => oracle("ADMITTED")),
  }));
  const result = analyzeNowait(blocks, 100, true, observed(100));
  assert.equal(result.status, "PASS");
  assert.equal(result.avoidable, 0);
  assert.equal(result.eligible, 100);
  assert.ok(result.oneSided95AttemptUpper.upper > 0);
  assert.equal(analyzeNowait(blocks, 101, true, observed(100)).status, "INCONCLUSIVE");
  assert.equal(analyzeNowait(blocks, 100, false, observed(100)).status, "INCONCLUSIVE");
  assert.equal(analyzeNowait(blocks, 100, true).status, "INCONCLUSIVE");
});

test("one avoidable LOCK_BUSY fails despite remaining eligible admissions", () => {
  const blocks = Array.from({ length: 10 }, () => ({
    attempts: Array.from({ length: 10 }, () => oracle("ADMITTED")),
  }));
  blocks[4].attempts[0] = oracle("LOCK_BUSY");
  const outcome = analyzeNowait(blocks, 100, true, observed(99));
  assert.equal(outcome.status, "FAIL");
  assert.equal(outcome.avoidable, 1);
  assert.equal(outcome.totalLockBusy, 1);
  assert.ok(outcome.oneSided95IndependentBlockUpper.upper > 0.1);
});

test("true exhausted quotas excluded from eligible-with-headroom denominator", () => {
  const blocks = Array.from({ length: 10 }, () => ({
    attempts: [oracle("ADMITTED"), oracle("QUOTA", false)],
  }));
  const outcome = analyzeNowait(blocks, 10, true, observed(10));
  assert.equal(outcome.status, "PASS");
  assert.equal(outcome.eligible, 10);
  assert.equal(outcome.realExhaustion, 10);
});

test("unverified oracle never permits positive NOWAIT qualification", () => {
  const blocks = Array.from({ length: 10 }, () => ({
    attempts: [oracle("ADMITTED")],
  }));
  blocks[2].attempts[0].oracle.orderedAgainstCommits = false;
  assert.equal(analyzeNowait(blocks, 9, true, observed(9)).status, "INCONCLUSIVE");
  assert.throws(() => quantile([-1, 2], 0.99), /finite nonnegative/);
});

test("independent mock receive or committed debit mismatch fails cost proof", () => {
  const blocks = Array.from({ length: 10 }, () => ({
    attempts: [oracle("ADMITTED")],
  }));
  const mismatch = { ...observed(10), globalSpentDelta: 11 };
  assert.equal(analyzeNowait(blocks, 10, true, mismatch).status, "FAIL");
  assert.equal(analyzeNowait(blocks, 10, true,
    { ...observed(10), independentMockReceives: 9 }).status, "INCONCLUSIVE");
});
