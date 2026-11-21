import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertNotDomainPass, domainReadinessReport, REQUIRED_DOMAIN_EVIDENCE,
} from "./pg17-domain-readiness.mjs";
import { RACE_CASES } from "./race-matrix.mjs";

test("all 21 real command pairs explicitly blocked, across all 210 branch schedules", () => {
  const report = domainReadinessReport();
  assert.equal(report.cases.length, 21);
  assert.equal(report.blocked, 210);
  assert.equal(report.passed, 0);
  assert.equal(report.executed, 0);
  assert.equal(assertNotDomainPass(report), true);
  assert.deepEqual(report.cases.map(({ id }) => id), RACE_CASES.map(({ id }) => id));
  assert.equal(report.cases.filter(({ admission }) => admission).length, 6);
  assert.equal(new Set(report.cases.flatMap(({ commands }) => commands)).size > 10, true);
  assert.equal(REQUIRED_DOMAIN_EVIDENCE.length, 6);
});

test("synthetic quota, physical smokes and forged result cannot become domain PASS", () => {
  for (const forged of [
    null, {}, { ...domainReadinessReport(), passed: 1 },
    { ...domainReadinessReport(), executed: 8 },
    { ...domainReadinessReport(), blocked: 202 },
    { ...domainReadinessReport(), status: "PG17_PASS" },
  ]) {
    assert.throws(() => assertNotDomainPass(forged), /UNBOUND_PASS_FORBIDDEN/);
  }
});
