import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as runtime from "./v3-acceptance-runtime.mjs";
import { createMigrationProof } from "./v3-acceptance-migrations.mjs";
import { createSourceProof } from "./v3-acceptance-source-proofs.mjs";
import { createRaceProof } from "./v3-acceptance-races.mjs";
import { createKilled95Proof } from "./v3-acceptance-killed95.mjs";
import { createBootstrap } from "./v3-acceptance-bootstrap.mjs";
import {
  mandatoryOwnerPinSources, verifySourceOwnerPins,
} from "../../scripts/issue300-r2-trusted-root-consistency.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const files = [
  "v3-acceptance.mjs",
  "v3-acceptance-runtime.mjs",
  "v3-acceptance-migrations.mjs",
  "v3-acceptance-source-proofs.mjs",
  "v3-acceptance-races.mjs",
  "v3-acceptance-killed95.mjs",
  "v3-acceptance-bootstrap.mjs",
];
const source = name => readFileSync(join(directory, name), "utf8");

test("seven authored V3 responsibilities remain structurally bounded", () => {
  for (const name of files) {
    const lines = source(name).trimEnd().split(/\r?\n/).length;
    assert(lines <= 300, name + " exceeds 300 physical lines: " + lines);
  }
  assert.equal(new Set(files).size, 7);
});

test("every focused factory wires required migration and proof capabilities", () => {
  const migration = createMigrationProof(runtime);
  const sources = createSourceProof(runtime);
  const races = createRaceProof({ ...runtime, ...migration });
  const killed = createKilled95Proof({ ...runtime, ...migration });
  const bootstrap = createBootstrap(runtime);
  for (const fn of [
    migration.catalog, migration.migrate, migration.ledger,
    sources.fixture, sources.integrity, sources.attributionFreeze,
    sources.provisionAndAcl, races.interruption, races.racing,
    killed.processKillWhileLocked, bootstrap.launch, bootstrap.createDb,
  ]) assert.equal(typeof fn, "function");
  assert.match(source("v3-acceptance.mjs"), /const \{migrate,catalog\} = migrations;/);
});

test("moved security authority is still pinned to a fresh signed Owner lease", () => {
  const runtime = source("v3-acceptance-runtime.mjs");
  assert.match(runtime, /verify\(null,bytes,publicKey,signature\)/);
  assert.match(runtime, /leaseValidUntil\(validateSignedLease,Date\.now,lease\.leaseId,0\)/);
  assert.match(runtime, /assert\(info\.purpose==="ISSUE300_R2_W6_V3_EXCLUSIVE_MIGRATION"/);
  assert.match(runtime, /assertCurrentLease:[\s\S]*?return validateSignedLease\(\)/);
  assert.match(runtime, /"git",\["-C",root,"diff","--exit-code",anchorSha,latest/);
  const bootstrap = source("v3-acceptance-bootstrap.mjs");
  assert.match(bootstrap, /state\.lease=validateSignedLease\(\)/);
  assert.match(bootstrap, /assertOwned\(inspect\(\),true\)/);
  assert.match(bootstrap, /state\.ownership=true/);
});

test("tracked V3 module retains exact pinned Owner root convergence", () => {
  const result = verifySourceOwnerPins(join(directory, "../.."), {
    requireV3: false,
  });
  assert.equal(result.sourceCount, mandatoryOwnerPinSources.length);
  assert(mandatoryOwnerPinSources.includes(
    "tmp/issue300-w16-v3-killed95-guard/v3-acceptance-runtime.mjs"));
  // This verifies only source pins. The separate ignored V3 artifact is
  // absent in a fresh checkout and cannot be claimed as an Owner signature.
});

test("migration and killed95 proof still refuse missing SQL backend drain", () => {
  const migrations = source("v3-acceptance-migrations.mjs");
  const race = source("v3-acceptance-races.mjs");
  const death = source("v3-acceptance-killed95.mjs");
  assert.match(migrations, /state\.lease\.expiresAt/);
  assert.match(migrations, /state\.unsafePressure=true/);
  assert.match(race, /assert\(racePassed\(concurrent,observation\)/);
  assert.match(death, /witnessAndKill95\(/);
  assert.match(death, /heldLockExitBarrier95\(/);
  assert.match(death, /KILLED95_UNDRAINED_BACKEND_QUARANTINE/);
  assert.match(death, /KILLED95_HOLDER_LEASE_OR_BACKEND_UNKNOWN_QUARANTINE/);
  assert(death.indexOf('output("process_death_while_ddl_blocked","PASS"') >
    death.indexOf("heldLockExitBarrier95("));
});

test("V3 overall PASS remains behind verified owned-container stop", () => {
  const runner = source("v3-acceptance.mjs");
  assert.match(runner, /assert\(process\.argv\[2\]==="--run"/);
  assert.match(runner, /await finalizeV3AfterVerifiedStop\(/);
  assert.match(runner, /mayPublishOverall:\(\)=>readyForOverall&&!state\.hasGap/);
  assert.equal(runner.match(/output\("v3_overall","PASS"/g)?.length, 1);
  assert(runner.indexOf('recordOverall:receipt=>output("v3_overall","PASS"') >
    runner.indexOf("await finalizeV3AfterVerifiedStop("));
});

test("explicit V3 --check verifies migration boundary without starting services", () => {
  const result = execFileSync(process.execPath,
    [join(directory, "v3-acceptance.mjs"), "--check"], {
      cwd: join(directory, "../.."),
      windowsHide: true, encoding: "utf8", timeout: 15000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  const evidence = JSON.parse(result.trim());
  assert.equal(evidence.mode, "OFFLINE_ONLY");
  assert.equal(evidence.mutatedDocker, false);
  assert.equal(evidence.migrations, 96);
  assert.equal(evidence.unchangedPrismaTree, true);
  assert.equal("unchangedDatabaseTree" in evidence, false);
  assert.deepEqual(evidence.boundedTransactionMigrations, [94, 95, 96]);
  assert.equal(evidence.requiresExplicitPrimeLease, true);
});

test("V3 pins whole DB runtime/Prisma tree except named rollout and test-only manifest files", () => {
  const runtime = source("v3-acceptance-runtime.mjs");
  assert.match(runtime, /anchorSha,latest,"--",\.\.\.releaseGateOnly/);
  assert.match(runtime, /"HEAD","--",\.\.\.releaseGateOnly/);
  assert.match(runtime, /const releaseGateOnly=\["packages\/database"/);
  for (const expected of ["run-migrate-deploy.mjs",
    "issue300-production-migration-gate.mjs",
    "issue300-production-migration-gate.test.mjs"]) {
    assert.match(runtime, new RegExp("\\(exclude\\)packages/database/scripts/"+expected.replace(/\./g,"\\.")));
  }
  for (const expected of ["issue300-migration-source-appendix.ts",
    "financial-policy-migration.integration.test.ts",
    "basic-branding-migration.integration.test.ts",
    "cash-reconciliation-migration.integration.test.ts",
    "location-configuration-migration.integration.test.ts",
    "task-dispatch-persistence.integration.test.ts",
    "schema.integration.test.ts",
    "runtime-role.integration.test.ts",
    "location-configuration-runtime-role.integration.test.ts",
    "seed.integration.test.ts",
    "payment-collection-migration.integration.test.ts",
    "basic-branding-runtime-privilege.integration.test.ts",
    "phase4-runtime-role.integration.test.ts"]) {
    assert.match(runtime, new RegExp("\\(exclude\\)packages/database/src/"+expected.replace(/\./g,"\\.")));
  }
  assert.doesNotMatch(runtime, /\(exclude\)packages\/database\/prisma/);
});
