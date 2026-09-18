import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";

import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  appendOwnershipEvent,
  clusterKey,
  createOwnedResourceName,
  createRunId,
  isProcessAlive,
  readOwnershipEvents,
  releaseClusterLease,
} from "./ownership-state.mjs";

const databaseUrl = "postgresql://owner:secret@127.0.0.1:5432/valet";

test("one cluster admits only one live invocation", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-lease-"));
  const runId = createRunId("first", "fixed");
  try {
    acquireClusterLease({
      databaseUrl,
      projectName: "first",
      runId,
      stateRoot,
    });
    assert.throws(
      () =>
        acquireClusterLease({
          databaseUrl,
          projectName: "second",
          runId: "run_second",
          stateRoot,
        }),
      /already owned by first.*Use a separate test cluster/i,
    );
    releaseClusterLease({ databaseUrl, runId, stateRoot });
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("a dead prior owner is recoverable only from matching ownership metadata", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-stale-"));
  const clusterDir = join(stateRoot, clusterKey(databaseUrl));
  mkdirSync(clusterDir, { recursive: true });
  writeFileSync(
    join(clusterDir, "owner.json"),
    JSON.stringify({
      cluster: "postgresql://127.0.0.1:5432",
      pid: 2_147_483_647,
      projectName: "dead-run",
      recoveryRunIds: ["older-owned-run"],
      runId: "dead-owned-run",
    }),
  );
  try {
    const lease = acquireClusterLease({
      databaseUrl,
      projectName: "replacement",
      runId: "replacement-run",
      stateRoot,
    });
    assert.equal(lease.staleOwner.runId, "dead-owned-run");
    assert.deepEqual(lease.staleOwner.recoveryRunIds, ["older-owned-run"]);
    releaseClusterLease({ databaseUrl, runId: "replacement-run", stateRoot });
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("resource identity is bounded, unique, and recorded before creation", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-owned-"));
  const runId = "run_identity";
  try {
    const first = createOwnedResourceName({
      fixtureId: "fixture",
      kind: "database",
      nonce: "one",
      runId,
      workerId: "w1",
    });
    const second = createOwnedResourceName({
      fixtureId: "fixture",
      kind: "database",
      nonce: "two",
      runId,
      workerId: "w1",
    });
    assert.notEqual(first, second);
    assert.ok(first.length <= 63);
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      workerId: "w1",
      event: { type: "resource-planned", kind: "database", name: first },
    });
    const [event] = readOwnershipEvents({ databaseUrl, runId, stateRoot });
    assert.equal(event.name, first);
    assert.equal(event.workerId, "w1");
    assert.match(event.resourceId, /^[a-f0-9]{20}$/);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("partial setup cleanup touches only ledger-owned resources", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-partial-"));
  const runId = "run_partial";
  const existingDatabases = new Set(["owned_db", "vlt_t_db_unknown_legacy"]);
  const existingRoles = new Set(["vlt_t_role_unknown_legacy"]);
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: { type: "resource-planned", kind: "database", name: "owned_db" },
    });
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: { type: "resource-created", kind: "database", name: "owned_db" },
    });
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-planned",
        kind: "role",
        name: "owned_role_never_created",
      },
    });
    await cleanupOwnedRun({
      databaseUrl,
      runId,
      stateRoot,
      adapter: {
        async dropDatabase(name) {
          dropped.push(`db:${name}`);
          existingDatabases.delete(name);
        },
        async dropRole(name) {
          dropped.push(`role:${name}`);
          existingRoles.delete(name);
        },
        async findExistingDatabases(names) {
          return names.filter((name) => existingDatabases.has(name));
        },
        async findExistingRoles(names) {
          return names.filter((name) => existingRoles.has(name));
        },
        async killProcess() {},
      },
    });
    assert.deepEqual(dropped, ["db:owned_db"]);
    assert.ok(existingDatabases.has("vlt_t_db_unknown_legacy"));
    assert.ok(existingRoles.has("vlt_t_role_unknown_legacy"));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("planned-only resources are never treated as owned", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-planned-only-"));
  const runId = "run_planned_only";
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-planned",
        kind: "database",
        name: "preexisting_name_collision",
      },
    });
    await cleanupOwnedRun({
      databaseUrl,
      runId,
      stateRoot,
      adapter: {
        async dropDatabase(name) {
          dropped.push(name);
        },
        async dropRole() {},
        async findExistingDatabases() {
          return [];
        },
        async findExistingRoles() {
          return [];
        },
        async killProcess() {},
      },
    });
    assert.deepEqual(dropped, []);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("planned resource proven absent before create is crash-recoverable", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-crash-window-"));
  const runId = "run_crash_window";
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-planned",
        kind: "database",
        name: "owned_after_commit_gap",
        absentBeforeCreate: true,
      },
    });
    await cleanupOwnedRun({
      databaseUrl,
      runId,
      stateRoot,
      adapter: {
        async dropDatabase(name) {
          dropped.push(name);
        },
        async dropRole() {},
        async findExistingDatabases() {
          return [];
        },
        async findExistingRoles() {
          return [];
        },
        async killProcess() {},
      },
    });
    assert.deepEqual(dropped, ["owned_after_commit_gap"]);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("parent cleanup terminates a surviving child from a killed worker ledger", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-child-"));
  const runId = "run_child";
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    windowsHide: true,
  });
  await once(child, "spawn");
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      workerId: "dead-worker",
      event: { type: "child-started", pid: child.pid },
    });
    await cleanupOwnedRun({
      databaseUrl,
      runId,
      stateRoot,
      adapter: {
        async dropDatabase() {},
        async dropRole() {},
        async findExistingDatabases() {
          return [];
        },
        async findExistingRoles() {
          return [];
        },
        async killProcess(pid) {
          assert.equal(pid, child.pid);
          process.kill(pid, "SIGTERM");
          await once(child, "exit");
        },
      },
    });
    assert.equal(isProcessAlive(child.pid), false);
  } finally {
    if (isProcessAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
