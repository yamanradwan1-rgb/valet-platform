import { execFile } from "node:child_process";
import { mkdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolvePrismaMigrateInvocation } from "./prisma-migrations.mjs";
import { assertFixedMigration113OnDisk, assertFailed113Snapshot,
  assertResolve113OnlyChangedTarget, FAILED_113 } from "./resolve-113-guard.mjs";
import { snapshotW9RecoveryState } from "./resolve-113-state.mjs";
import { preflightSanitizedChild } from "./target-preflight.mjs";
import { sanitizedChildEnvironment } from "./target-contract.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const childPreflight = new URL("./child-preflight.mjs", import.meta.url).href;
// Shared with private Vitest global setup, which refuses existing leases.
const leasePath = join(tmpdir(), "vaylet-issue416-w9-pg17-exclusive-lease");

export function assertResolve113Mode(argv) {
  if (!Array.isArray(argv) || argv.length !== 1 || argv[0] !== "--resolve-113") {
    throw new Error("Issue416 W9 recovery requires exactly --resolve-113.");
  }
}

export async function resolveOnlyFailed113(env = process.env) {
  const invocation = resolvePrismaMigrateInvocation();
  await preflightSanitizedChild(env); // Must precede lease and any writes.
  try {
    await mkdir(leasePath);
  } catch {
    throw new Error("Issue416 W9 recovery requires an unused private fixture lease.");
  }

  try {
    await assertFixedMigration113OnDisk();
    const old = await snapshotW9RecoveryState(env);
    assertFailed113Snapshot(old.rows, old.catalog);
    const clean = sanitizedChildEnvironment(env);
    clean.NODE_OPTIONS = `--import=${childPreflight}`;
    // Exact one-record Prisma bookkeeping change only. No generic cleanup,
    // failed SQL re-run, deploy, reset, or arbitrary migration identifier.
    await execFileAsync(process.execPath, [invocation.cli, "migrate", "resolve",
      "--rolled-back", FAILED_113], {
      cwd: packageRoot,
      env: clean,
      encoding: "utf8",
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 128 * 1024,
    });
    const current = await snapshotW9RecoveryState(env);
    assertResolve113OnlyChangedTarget(old.rows, current.rows);
    if (JSON.stringify(old.roles) !== JSON.stringify(current.roles) ||
        JSON.stringify(old.memberships) !== JSON.stringify(current.memberships)) {
      throw new Error("Issue416 recovery unexpectedly altered historical roles or memberships.");
    }
    if (!current.catalog || current.catalog.schema_count !== 0 ||
        current.catalog.proof_role_count !== 0 ||
        current.catalog.relation_count !== 0) {
      throw new Error("Issue416 recovery unexpectedly changed private catalog state.");
    }
    return { migration: FAILED_113, rolledBack: true };
  } finally {
    // Remove only this invocation's empty lease directory. Never touch DB or
    // run any stale-owner recovery after errors.
    await rmdir(leasePath);
  }
}
