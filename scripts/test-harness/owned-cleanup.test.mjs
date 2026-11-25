import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildOwnedCleanupPlan, cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  appendOwnershipEvent,
  releaseClusterLease,
} from "./ownership-state.mjs";
import { postgresEndpointIdentity } from "./postgres-endpoint.mjs";

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

test("secondary cleanup is rejected without a live lease or an exact endpoint-bound adapter", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "w4-owned-secondary-"));
  const secondaryUrl = "postgresql://owner:secret@127.0.0.1:55473/valet";
  const runId = "run_w4_secondary_cleanup";
  const dropped = [];
  const adapter = cleanupAdapter({ existingDatabases: new Set(), dropped });
  adapter.ownershipEndpoint = postgresEndpointIdentity(secondaryUrl).key;
  try {
    appendOwnershipEvent({
      databaseUrl: secondaryUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-created",
        kind: "role",
        name: "owned_secondary_role",
      },
    });
    const input = {
      adapter,
      databaseUrl: secondaryUrl,
      runId,
      stateRoot,
      requireAttestedTarget: true,
    };
    await assert.rejects(
      cleanupOwnedRun(input),
      /no active cluster ownership metadata/,
    );
    assert.deepEqual(dropped, []);
    acquireClusterLease({
      databaseUrl: secondaryUrl,
      projectName: "secondary",
      runId,
      stateRoot,
    });
    try {
      adapter.ownershipEndpoint = postgresEndpointIdentity(databaseUrl).key;
      await assert.rejects(cleanupOwnedRun(input), /adapter endpoint mismatch/);
      assert.deepEqual(dropped, []);
      adapter.ownershipEndpoint = postgresEndpointIdentity(secondaryUrl).key;
      const result = await cleanupOwnedRun(input);
      assert.equal(result.roleCount, 1);
      assert.deepEqual(dropped, ["role:owned_secondary_role"]);
    } finally {
      releaseClusterLease({ databaseUrl: secondaryUrl, runId, stateRoot });
    }
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("attested secondary cleanup refuses to drop the connected admin role or database", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "w4-owned-admin-deny-"));
  const secondaryUrl = "postgresql://owner:secret@127.0.0.1:55473/valet";
  const runId = "run_w4_secondary_admin_deny";
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl: secondaryUrl,
      runId,
      stateRoot,
      event: { type: "resource-created", kind: "role", name: "owner" },
    });
    acquireClusterLease({
      databaseUrl: secondaryUrl,
      projectName: "secondary",
      runId,
      stateRoot,
    });
    try {
      await assert.rejects(
        cleanupOwnedRun({
          adapter: {
            ...cleanupAdapter({ existingDatabases: new Set(), dropped }),
            ownershipEndpoint: postgresEndpointIdentity(secondaryUrl).key,
          },
          databaseUrl: secondaryUrl,
          runId,
          stateRoot,
          requireAttestedTarget: true,
        }),
        /cannot drop its own administrative identity/,
      );
      assert.deepEqual(dropped, []);
    } finally {
      releaseClusterLease({ databaseUrl: secondaryUrl, runId, stateRoot });
    }
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("polluted legacy ledger fails before any cleanup action on admin or protected shared roles", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "w4-contaminated-primary-"));
  const runId = "run_w4_contaminated_primary";
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: { type: "resource-created", kind: "role", name: "owner" },
    });
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-created",
        kind: "role",
        name: "vap1_proof_owner",
      },
    });
    await assert.rejects(
      cleanupOwnedRun({
        adapter: cleanupAdapter({ existingDatabases: new Set(), dropped }),
        databaseUrl,
        runId,
        stateRoot,
      }),
      /cannot drop its own administrative identity/,
    );
    assert.deepEqual(dropped, []);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("legacy shared-role ownership is denied even when it is not the cleanup login", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "w4-shared-role-guard-"));
  const runId = "run_w4_shared_role_guard";
  const dropped = [];
  try {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      stateRoot,
      event: {
        type: "resource-created",
        kind: "role",
        name: "vaylet_management_writer",
      },
    });
    await assert.rejects(
      cleanupOwnedRun({
        adapter: cleanupAdapter({ existingDatabases: new Set(), dropped }),
        databaseUrl,
        runId,
        stateRoot,
      }),
      /refuses protected shared roles/,
    );
    assert.deepEqual(dropped, []);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
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
