/**
 * Issue #463 P7 local-owned browser proof bootstrap.
 *
 * Running with --check performs source-only validation.
 * --execute requires a clean, exact integrated candidate, a separate explicit
 * operator opt-in, and a fresh Docker Desktop Linux PostgreSQL 17 container.
 * There is no pre-existing database target, network secret or RELEASE fallback.
 *
 * In the final clean integrated worktree only:
 *   ISSUE463_P7_EXPECTED_CANDIDATE=<exact HEAD SHA>
 *   ISSUE463_P7_BOOTSTRAP=I_OWN_DISPOSABLE_463
 *   node apps/api/tools/run-issue463-browser-proof.mjs --check
 *   node apps/api/tools/run-issue463-browser-proof.mjs --execute
 * Never set database URLs or proof secrets in the invoking environment.
 */
import { randomBytes } from "node:crypto";
import console from "node:console";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertLocalDocker, bootstrapOwnedDatabase,
  createOwnedPg17, removeOwnedContainer,
} from "./issue463-browser-proof-docker.mjs";
import {
  checkIntegratedCandidate,
  createP7Credentials, newP7Passwords, provisionP7, runP7Step,
} from "./issue463-browser-proof-bootstrap.mjs";
import { assertMigrationTarget } from "./issue463-browser-proof-migration.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const optIn = "I_OWN_DISPOSABLE_463";
const externalSecrets = [
  "DATABASE_URL", "MIGRATION_DATABASE_URL", "STAFF_AUTH_WRITER_DATABASE_URL",
  "MFA_WRITER_DATABASE_URL", "MANAGEMENT_WRITER_DATABASE_URL",
  "RATING_FEEDBACK_APPROVER_DATABASE_URL",
  "RATING_FEEDBACK_EXECUTOR_DATABASE_URL",
  "ANTI_ABUSE_SQL_PROOF_SECRET_B64URL",
  "ANTI_ABUSE_HMAC_SECRET_B64URL", "MFA_ACTIVITY_PROOF_SECRET_B64URL",
];

function assertExplicitExecution() {
  if (process.env.ISSUE463_P7_BOOTSTRAP !== optIn ||
      process.env.NODE_ENV === "production" ||
      process.env.CI !== undefined ||
      process.env.GITHUB_ACTIONS !== undefined ||
      ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"].some(
        (key) => process.env[key] !== undefined,
      ) ||
      externalSecrets.some((key) => process.env[key] !== undefined)) {
    throw new Error(
      "Issue463 P7 refuses production/CI/external secrets or missing explicit opt-in.",
    );
  }
}

function signalHandlers(state) {
  const interrupt = () => {
    state.interrupted = true;
    state.stopChild?.();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  return () => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  };
}

async function execute() {
  assertExplicitExecution();
  const requested = process.env.ISSUE463_P7_EXPECTED_CANDIDATE;
  const integrated = await checkIntegratedCandidate(root, requested);
  assertLocalDocker();
  const owner = randomBytes(16).toString("hex");
  const passwords = newP7Passwords();
  const state = { interrupted: false, stopChild: null, child: null };
  const removeSignals = signalHandlers(state);
  let allocation;
  let result;
  try {
    const target = await createOwnedPg17(
      owner, passwords.postgres, (created) => { allocation = created; },
    );
    const database = await bootstrapOwnedDatabase(target, owner, passwords);
    const candidate = integrated.sha;
    const configured = createP7Credentials(root, owner, {
      ...target, candidate, systemId: database.systemId,
    }, database.database, passwords);
    const env = configured.env;
    const total = await assertMigrationTarget(root, env, false);
    if (total !== integrated.migrationCount) {
      throw new Error("Issue463 pinned migration manifest changed after preflight.");
    }
    await provisionP7(root, env, state);
    if (state.interrupted) throw new Error("Issue463 P7 interrupted before browser test.");
    console.log("PASS provisioned P2_TEST then P5_TEST; never RELEASE");
    const proofEnv = { ...env, RATING_FEEDBACK_STAGE: "P5_TEST" };
    for (const file of [
      "issue463-p2-disposable-smoke.mjs",
      "issue463-p2-disposable-privacy-races.mjs",
      "issue463-p5-disposable-projection.mjs",
      "issue463-p5-disposable-ma-lk.mjs",
      "issue463-p5-final-races.mjs",
    ]) {
      await runP7Step(root, file, process.execPath,
        ["packages/database/scripts/" + file], proofEnv, state, 180000);
    }
    await runP7Step(root, "real Issue463 browser proof", "pnpm", [
      "--dir", "apps/api", "exec", "vitest", "run", "--config",
      "vitest.issue463-browser.config.mjs",
    ], { ...env, RATING_FEEDBACK_STAGE: "P5_TEST" }, state, 1200000);
    result = {
      verdict: "PASS", candidate, database: database.database,
      container: target.id, systemId: database.systemId,
      migrations: total, stage: "P5_TEST", released: false,
    };
  } finally {
    try {
      if (allocation?.id) {
        removeOwnedContainer(allocation, owner);
        console.log("PASS removed exact owned Issue463 P7 Docker container");
      }
    } finally { removeSignals(); }
  }
  if (!result) throw new Error("Issue463 P7 did not complete.");
  console.log(JSON.stringify({ ...result, cleanup: "verified" }));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 1 || !["--check", "--execute"].includes(argv[0])) {
    throw new Error("Use --check or explicitly authorized --execute.");
  }
  if (argv[0] === "--check") {
    const status = await checkIntegratedCandidate(
      root, process.env.ISSUE463_P7_EXPECTED_CANDIDATE,
    );
    console.log("PASS source-only Issue463 P7 candidate check " + status.sha);
    return;
  }
  await execute();
}

main().catch((error) => {
  // Never print child stdout/stderr or complete errors containing passwords.
  const known = error instanceof Error ? error.message : "unknown";
  const safe = known.startsWith("Issue463") || known.startsWith("Use --")
    ? known : "Issue463 P7 failed a protected bootstrap step.";
  console.error("FAIL " + safe);
  process.exitCode = 1;
});
