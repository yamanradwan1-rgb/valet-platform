import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  appendOwnershipEvent,
  assertClusterLeaseOwner,
  createRunId,
  releaseClusterLease,
} from "./ownership-state.mjs";
import { parkClusterLeaseForRecovery } from "./park-cluster-lease.mjs";
import {
  preflightIssue215BeforeHarnessCleanup,
  requiresIssue215Preflight,
  requiresIssue215StaleOwnerPreflight,
} from "./issue215-target-preflight.mjs";
import { createPostgresCleanupAdapter } from "./postgres-cleanup-adapter.mjs";

export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://valet:valet@127.0.0.1:5432/valet";

export function testDatabaseUrl() {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    DEFAULT_TEST_DATABASE_URL
  );
}

export async function acquireInvocationLease(label, { selectedProjects = [] } = {}) {
  await preflightIssue215BeforeHarnessCleanup(selectedProjects);
  const inheritedRunId = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (inheritedRunId) {
    const databaseUrl = testDatabaseUrl();
    assertClusterLeaseOwner({ databaseUrl, runId: inheritedRunId });
    if (requiresIssue215Preflight(selectedProjects)) {
      appendOwnershipEvent({
        databaseUrl, runId: inheritedRunId,
        event: { type: "issue215-protected-run" },
      });
    }
    const adapter = createCleanupAdapter(databaseUrl, label);
    return {
      owned: false,
      runId: inheritedRunId,
      cleanup: () =>
        cleanupOwnedRun({
          adapter,
          databaseUrl,
          preserveRunState: true,
          runId: inheritedRunId,
        }),
      release: async () => {},
    };
  }

  const databaseUrl = testDatabaseUrl();
  const runId = createRunId(label);
  const lease = acquireClusterLease({
    databaseUrl, projectName: label, runId,
    issue215Protected: requiresIssue215Preflight(selectedProjects),
  });
  if (requiresIssue215Preflight(selectedProjects)) {
    appendOwnershipEvent({
      databaseUrl, runId, event: { type: "issue215-protected-run" },
    });
  }
  const adapter = createCleanupAdapter(databaseUrl, label);
  if (lease.staleOwner !== undefined) {
    if (requiresIssue215StaleOwnerPreflight(lease.staleOwner)) {
      try {
        await preflightIssue215BeforeHarnessCleanup([ "database-postgres-issue215" ]);
      } catch (error) {
        parkClusterLeaseForRecovery({ databaseUrl, runId, stateRoot: lease.stateRoot });
        throw error;
      }
    }
    const recoveryRunIds = [
      lease.staleOwner.runId,
      ...(lease.staleOwner.recoveryRunIds ?? []),
    ];
    for (const recoveryRunId of [...new Set(recoveryRunIds)]) {
      await cleanupOwnedRun({
        adapter,
        databaseUrl,
        recoverCoordinatorChildren: true,
        runId: recoveryRunId,
        stateRoot: lease.stateRoot,
      });
    }
  }
  process.env.VAYLET_TEST_CLUSTER_RUN_ID = runId;
  const cleanup = () =>
    cleanupOwnedRun({
      adapter,
      databaseUrl,
      preserveRunState: true,
      runId,
    });
  return {
    owned: true,
    runId,
    cleanup,
    async release() {
      await cleanupOwnedRun({
        adapter,
        databaseUrl,
        recoverCoordinatorChildren: true,
        runId,
      });
      delete process.env.VAYLET_TEST_CLUSTER_RUN_ID;
      releaseClusterLease({ databaseUrl, runId, stateRoot: lease.stateRoot });
    },
  };
}

function createCleanupAdapter(databaseUrl, label) {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const databaseInvocation = label === "database-package-tests" ||
    label === "focused-database" || label.startsWith("postgres-projects-database-");
  const requireFromOwner = createRequire(
    fileURLToPath(new URL(
      databaseInvocation
        ? "../../packages/database/package.json"
        : "../../apps/api/package.json",
      import.meta.url,
    )),
  );
  return createPostgresCleanupAdapter({
    adminDatabaseUrl: databaseUrl,
    pg: requireFromOwner("pg"),
    repositoryRoot,
  });
}
