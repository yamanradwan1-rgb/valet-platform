import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  clusterKey,
  releaseClusterLease,
} from "./ownership-state.mjs";
import {
  assertClusterRecoveryPermitted,
  assertRunCleanupPermitted,
  completeResourceQuarantine,
  releaseResourceQuarantine,
  reserveResourceQuarantine,
} from "./resource-quarantine.mjs";

// These tests operate exclusively on mkdtemp filesystem state. No PG adapter,
// Docker target, application fixture, or production database is opened.
const DATABASE_URL = "postgresql://unit:unit@127.0.0.1:45432/vaylet_test";
const MARKER = "issue442-u003-resource-quarantine.json";

async function withRoot(callback) {
  const root = mkdtempSync(join(tmpdir(), "vlt-u003-quarantine-unit-"));
  const clusterDir = join(root, clusterKey(DATABASE_URL));
  mkdirSync(clusterDir, { recursive: true });
  try {
    return await callback({ root, clusterDir });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function fakeAdapter(calls) {
  return {
    async killProcess() {
      calls.push("kill");
      throw Error("Unexpected owned child termination");
    },
    async dropDatabase() {
      calls.push("database");
      throw Error("Unexpected database drop");
    },
    async dropRole() {
      calls.push("role");
      throw Error("Unexpected role drop");
    },
    async findExistingDatabases() {
      calls.push("check-databases");
      return [];
    },
    async findExistingRoles() {
      calls.push("check-roles");
      return [];
    },
  };
}

test("PENDING marker refuses new cluster lease with no owner record", () =>
  withRoot(({ root, clusterDir }) => {
    reserveResourceQuarantine(clusterDir, "original", randomUUID());
    assert.throws(
      () =>
        acquireClusterLease({
          databaseUrl: DATABASE_URL,
          projectName: "other",
          runId: "other",
          stateRoot: root,
        }),
      /U003_RESOURCE_QUARANTINE/,
    );
    assert.equal(existsSync(join(clusterDir, "owner.json")), false);
  }));

test("PENDING marker blocks cross-run and same-run cleanup before all effects", async () => {
  await withRoot(async ({ root, clusterDir }) => {
    const nonce = randomUUID();
    reserveResourceQuarantine(clusterDir, "original", nonce);
    const calls = [];
    const adapter = fakeAdapter(calls);
    for (const runId of ["original", "other"]) {
      await assert.rejects(
        cleanupOwnedRun({
          adapter,
          databaseUrl: DATABASE_URL,
          runId,
          stateRoot: root,
        }),
        /U003_UNSETTLED_WRITER/,
      );
    }
    assert.deepEqual(calls, []);
  });
});

test("LOCAL_COMPLETE allows exact run cleanup, not unrelated recovery", async () => {
  await withRoot(async ({ root, clusterDir }) => {
    const nonce = randomUUID();
    reserveResourceQuarantine(clusterDir, "original", nonce);
    assert.throws(
      () => releaseResourceQuarantine(clusterDir, "original", nonce),
      /NOT_ATTESTED/,
    );
    assert.throws(
      () => completeResourceQuarantine(clusterDir, "original", "wrong"),
      /OWNER_MISMATCH/,
    );
    completeResourceQuarantine(clusterDir, "original", nonce);
    assert.throws(
      () => assertClusterRecoveryPermitted(clusterDir),
      /U003_RESOURCE_QUARANTINE/,
    );
    assert.throws(
      () => assertRunCleanupPermitted(clusterDir, "other"),
      /U003_UNSETTLED_WRITER/,
    );
    const calls = [];
    await cleanupOwnedRun({
      adapter: fakeAdapter(calls),
      databaseUrl: DATABASE_URL,
      runId: "original",
      stateRoot: root,
    });
    assert.deepEqual(calls, ["check-databases", "check-roles"]);
    releaseResourceQuarantine(clusterDir, "original", nonce);
    assertClusterRecoveryPermitted(clusterDir);
    assert.equal(existsSync(join(clusterDir, MARKER)), false);
  });
});

test("partially corrupted quarantine fails closed on both paths", () =>
  withRoot(({ clusterDir }) => {
    writeFileSync(join(clusterDir, MARKER), "{partial");
    assert.throws(() => assertClusterRecoveryPermitted(clusterDir));
    assert.throws(() => assertRunCleanupPermitted(clusterDir, "original"));
  }));

test("live owner cannot be stolen solely because heartbeat is stale", () =>
  withRoot(({ root, clusterDir }) => {
    const ownerPath = join(clusterDir, "owner.json");
    const original = {
      cluster: "postgresql://loopback:45432",
      pid: process.pid,
      projectName: "paused",
      runId: "still-live",
      startedAt: "2000-01-01T00:00:00.000Z",
    };
    writeFileSync(ownerPath, JSON.stringify(original));
    assert.throws(
      () =>
        acquireClusterLease({
          databaseUrl: DATABASE_URL,
          projectName: "contender",
          runId: "contender",
          stateRoot: root,
        }),
      /already owned by paused/,
    );
    assert.deepEqual(JSON.parse(readFileSync(ownerPath, "utf8")), original);
  }));

test("dead owner without resource quarantine remains recoverable", () =>
  withRoot(({ root, clusterDir }) => {
    writeFileSync(
      join(clusterDir, "owner.json"),
      JSON.stringify({
        cluster: "postgresql://loopback:45432",
        pid: 2_147_483_647,
        projectName: "dead",
        runId: "dead",
      }),
    );
    const next = acquireClusterLease({
      databaseUrl: DATABASE_URL,
      projectName: "new",
      runId: "new",
      stateRoot: root,
    });
    assert.equal(next.staleOwner.runId, "dead");
    releaseClusterLease({
      databaseUrl: DATABASE_URL,
      runId: "new",
      stateRoot: root,
    });
  }));
