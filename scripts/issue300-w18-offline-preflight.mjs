// Offline-only four-Staff and browser acceptance planner. Never opens PG/HTTP.
// The Owner-signed lease and independently read back W10 resources are
// separately required before any staff:provision or browser invocation.
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

/* global console */
import { readCanonicalManifest } from "./issue300-r2-v2-org-fixture-recovery.mjs";
import {
  fourStaffPlan, validateOrgReceipt, validateProductProvisionResults,
  assertIndependentGrantRows,
} from "./issue300-w18-staff-plan.mjs";
import { caseRunPlan } from "./issue300-w18-browser-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
const commands = ["--plan", "--check-provision-results", "--browser-plan"];

export function inspectOfflineFiles({ env, command, read = readCanonicalManifest }) {
  assert(commands.includes(command), "W18_UNKNOWN_OFFLINE_ACTION");
  const candidate = env.ISSUE300_R2_CANDIDATE_SHA;
  const lease = env.ISSUE300_W13_EXCLUSIVE_LEASE;
  const receipt = read(env.ISSUE300_W18_W10_RECEIPT, owned);
  validateOrgReceipt(receipt, candidate, lease);
  const staff = fourStaffPlan(candidate, lease);
  if (command === "--plan")
    return {
      kind: "ISSUE300_W18_OFFLINE_STAFF_PROVISION_PLAN",
      candidateSha: candidate, leaseId: lease,
      executable: false, staff,
      launcher: ["pnpm", "--filter", "@valet/api", "staff:provision", "--"],
      environment: ["NODE_ENV=test", "MIGRATION_DATABASE_URL=(private exact owner V2)"],
    };
  if (command === "--check-provision-results") {
    const results = read(env.ISSUE300_W18_PROVISION_RESULTS, owned);
    assert.equal(validateProductProvisionResults(staff, results), true);
    const rows = read(env.ISSUE300_W18_GRANT_READBACK, owned);
    assert.equal(assertIndependentGrantRows(staff, rows, results), true);
    return { kind: "ISSUE300_W18_OFFLINE_RECEIPTS_CHECK",
      candidateSha: candidate, leaseId: lease,
      submittedRowsMatchCanonicalReceipts: true,
      liveDbAndOwnerSignaturesNotVerified: true };
  }
  const scenario = read(env.ISSUE300_W18_BROWSER_SCENARIO, owned);
  return { kind: "ISSUE300_W18_BROWSER_CASE_PLAN", candidateSha: candidate,
    leaseId: lease,
    cases: caseRunPlan(scenario, candidate, lease, {
      organizationId: receipt.mainOrganizationId,
      locationId: receipt.locationIds[1],
    }) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: node ... --plan|--check-provision-results|--browser-plan");
  const value = inspectOfflineFiles({ env: process.env, command: process.argv[2] });
  console.log(JSON.stringify(value, null, 2));
}
