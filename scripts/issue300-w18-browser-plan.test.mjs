import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browserCases, caseRunPlan, validateBrowserScenario,
} from "./issue300-w18-browser-plan.mjs";

const candidate = "a".repeat(40);
const lease = "issue300-r2-w18-case-lease-20261020";
const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
};
const scenario = {
  candidateSha: candidate, leaseId: lease, ...scope,
  auditPath: "/audit-log?investigationDemo=1",
  date: "2026-10-20", start: "00:00", end: "23:59",
  expectsPaging: true,
  expectedSessionUuid: "33333333-3333-4333-8333-333333333333",
  expectedSourceId: "AUDIT:44444444-4444-4444-8444-444444444444",
};
test("exactly 34 one-use genuine MFA browser cases including 32 UI-M1", () => {
  const cases = caseRunPlan(scenario, candidate, lease, scope);
  assert.equal(browserCases.length, 34);
  assert.equal(new Set(browserCases).size, 34);
  assert.equal(cases.filter(c => c.title.startsWith("UI-M1")).length, 32);
  assert(cases.every(c => c.freshMfaSessionRequired &&
    c.freshOwnerAttestationRequired && c.browserOrigin.endsWith(":3117")));
  assert(cases.every(c => c.command.includes("--grep") &&
    c.command.includes("playwright.runtime.config.ts")));
  assert(new RegExp(cases[0].command.at(-1)).test(cases[0].title));
  assert(!new RegExp(cases[0].command.at(-1)).test(cases[1].title));
});
test("wrong signed candidate, scope, paging and route fail closed", () => {
  assert.equal(validateBrowserScenario(scenario, candidate, lease, scope), true);
  for (const corrupt of [
    { ...scenario, candidateSha: "b".repeat(40) },
    { ...scenario, organizationId: "99999999-9999-4999-8999-999999999999" },
    { ...scenario, locationId: "99999999-9999-4999-8999-999999999999" },
    { ...scenario, expectsPaging: false },
    { ...scenario, auditPath: "http://127.0.0.1:3114/audit-log" },
    { ...scenario, expectedSourceId: "unverified:fake" },
  ]) assert.throws(() => validateBrowserScenario(corrupt, candidate, lease, scope));
});
