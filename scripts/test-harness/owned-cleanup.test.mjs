import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildOwnedCleanupPlan, cleanupOwnedRun } from "./owned-cleanup.mjs";
import { appendOwnershipEvent } from "./ownership-state.mjs";

const databaseUrl = "postgresql://owner:secret@127.0.0.1:5432/valet";

test("ambiguous CREATE failure keeps absence-proven resource cleanup-owned", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "vaylet-ambiguous-create-"));
  const runId = "run_ambiguous_create";
  const existingDatabases = new Set(["owned_after_ambiguous_error"]);
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-planned",
        kind: "database",
        name: "owned_after_ambiguous_error",
        absentBeforeCreate: true,
      },
    });
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-create-failed",
        kind: "database",
        name: "owned_after_ambiguous_error",
      },
    });
    await cleanupOwnedRun({
      databaseUrl,
      runId,
      stateRoot,
      adapter: cleanupAdapter({ existingDatabases, dropped }),
    });
    assert.deepEqual(dropped, ["db:owned_after_ambiguous_error"]);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("failed CREATE without absence proof never becomes cleanup-owned", () => {
  const plan = buildOwnedCleanupPlan([
    {
      type: "resource-planned",
      kind: "database",
      name: "preexisting_or_unknown",
    },
    {
      type: "resource-create-failed",
      kind: "database",
      name: "preexisting_or_unknown",
    },
  ]);
  assert.deepEqual(plan.databases, []);
});

test("created and dropped resource semantics remain unchanged", () => {
  const plan = buildOwnedCleanupPlan([
    { type: "resource-created", kind: "database", name: "still_owned" },
    { type: "resource-created", kind: "database", name: "already_dropped" },
    { type: "resource-dropped", kind: "database", name: "already_dropped" },
    { type: "resource-created", kind: "role", name: "runtime_role" },
  ]);
  assert.deepEqual(
    plan.databases.map((item) => item.name),
    ["still_owned"],
  );
  assert.deepEqual(
    plan.roles.map((item) => item.name),
    ["runtime_role"],
  );
});

function cleanupAdapter({ existingDatabases, dropped }) {
  return {
    async dropDatabase(name) {
      dropped.push(`db:${name}`);
      existingDatabases.delete(name);
    },
    async dropRole(name) {
      dropped.push(`role:${name}`);
    },
    async findExistingDatabases(names) {
      return names.filter((name) => existingDatabases.has(name));
    },
    async findExistingRoles() {
      return [];
    },
    async killProcess() {},
  };
}
