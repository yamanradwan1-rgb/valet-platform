import { execFile } from "node:child_process";
import { mkdir, open, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";

import { resolvePrismaMigrateInvocation } from "./prisma-migrations.mjs";
import {
  assertFixedMigration113OnDisk,
  assertFailed113Snapshot,
  assertResolve113OnlyChangedTarget,
  assertOriginalW9RecoveryTarget,
  assertOriginalW9DefaultAcls,
  assertOriginalW9FullHistory,
  FAILED_113,
} from "./resolve-113-guard.mjs";
import { snapshotW9RecoveryState } from "./resolve-113-state.mjs";
import {
  observeRecovery113,
  superviseRecovery113,
} from "./resolve-113-outcome.mjs";
import { preflightSanitizedChild } from "./target-preflight.mjs";
import { sanitizedChildEnvironment } from "./target-contract.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const childPreflight = new URL(
  "./recovery-child-preflight.mjs",
  import.meta.url,
).href;
// Shared with private Vitest global setup, which refuses existing leases.
const leasePath = join(tmpdir(), "vaylet-issue416-w9-pg17-exclusive-lease");
const dispatchMarker = join(leasePath, "resolve-113-child-may-have-run.json");
const observedMarker = join(leasePath, "resolve-113-readonly-observation.json");

async function writeFsyncedMarker(path, value) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function assertResolve113Mode(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 1 ||
    argv[0] !== "--resolve-113"
  ) {
    throw new Error("Issue416 W9 recovery requires exactly --resolve-113.");
  }
}

export async function resolveOnlyFailed113(env = process.env) {
  const invocation = resolvePrismaMigrateInvocation();
  const initialTarget = await preflightSanitizedChild(env);
  assertOriginalW9RecoveryTarget(initialTarget); // Before lease or any write.
  try {
    await mkdir(leasePath);
  } catch {
    throw new Error(
      "Issue416 W9 recovery requires an unused private fixture lease.",
    );
  }

  let old;
  const assertCommitted = (current) => {
    assertOriginalW9RecoveryTarget(current.target, initialTarget);
    assertResolve113OnlyChangedTarget(old.rows, current.rows);
    assertOriginalW9DefaultAcls(old.defaultAcls, current.defaultAcls);
    if (
      JSON.stringify(old.roles) !== JSON.stringify(current.roles) ||
      JSON.stringify(old.memberships) !== JSON.stringify(current.memberships)
    ) {
      throw new Error(
        "Issue416 recovery unexpectedly altered historical roles or memberships.",
      );
    }
    if (
      !current.catalog ||
      current.catalog.schema_count !== 0 ||
      current.catalog.proof_role_count !== 0 ||
      current.catalog.relation_count !== 0
    ) {
      throw new Error(
        "Issue416 recovery unexpectedly changed private catalog state.",
      );
    }
  };
  let clean;
  const observed = await superviseRecovery113({
    prepare: async () => {
      await assertFixedMigration113OnDisk();
      old = await snapshotW9RecoveryState(env);
      assertOriginalW9RecoveryTarget(old.target, initialTarget);
      assertFailed113Snapshot(old.rows, old.catalog);
      assertOriginalW9FullHistory(old.rows);
      assertOriginalW9DefaultAcls(old.defaultAcls);
      clean = sanitizedChildEnvironment(env);
      clean.NODE_OPTIONS = `--import=${childPreflight}`;
      clean.ISSUE416_W9_RECOVERY_SERVER_STARTED = initialTarget.serverStarted;
    },
    arm: () =>
      writeFsyncedMarker(dispatchMarker, {
        migration: FAILED_113,
        state: "CHILD_MAY_HAVE_RUN",
        independentReviewRequired: true,
      }),
    // Exact official Prisma CLI and arguments are unchanged. There is no
    // automatic retry on child failure, timeout, spawn error, or uncertain COMMIT.
    invokeOfficialChild: () =>
      execFileAsync(
        process.execPath,
        [invocation.cli, "migrate", "resolve", "--rolled-back", FAILED_113],
        {
          cwd: packageRoot,
          env: clean,
          encoding: "utf8",
          windowsHide: true,
          timeout: 90_000,
          maxBuffer: 128 * 1024,
        },
      ),
    observe: () =>
      observeRecovery113({
        snapshot: () => snapshotW9RecoveryState(env),
        assertCommitted,
        assertUnchanged: (current) => {
          if (!isDeepStrictEqual(current, old)) {
            throw new Error(
              "Issue416 recovery state not identical to pre-child snapshot.",
            );
          }
        },
      }),
    record: (state, childFailed) =>
      writeFsyncedMarker(observedMarker, {
        migration: FAILED_113,
        state,
        childFailed,
        independentReviewRequired: true,
      }),
    release: async () => {
      // Only the exact known files from this invocation's empty lease;
      // never remove an unknown directory, stale lease, or database evidence.
      await rm(observedMarker, { force: true });
      await rm(dispatchMarker, { force: true });
      await rmdir(leasePath);
    },
  });
  if (observed === "COMMITTED_OBSERVED") {
    return { migration: FAILED_113, rolledBack: true };
  }
  throw new Error(
    "Issue416 recovery failed closed without an observed exact postcondition.",
  );
}
