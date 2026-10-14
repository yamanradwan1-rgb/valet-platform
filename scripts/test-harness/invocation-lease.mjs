import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  assertClusterLeaseOwner,
  createRunId,
  releaseClusterLease,
} from "./ownership-state.mjs";
import { preflightIssue215BeforeHarnessCleanup } from "./issue215-target-preflight.mjs";
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

export async function acquireInvocationLease(label) {
  await preflightIssue215BeforeHarnessCleanup(label);
  const inheritedRunId = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (inheritedRunId) {
    const databaseUrl = testDatabaseUrl();
    assertClusterLeaseOwner({ databaseUrl, runId: inheritedRunId });
    const adapter = createCleanupAdapter(databaseUrl);
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
  const lease = acquireClusterLease({ databaseUrl, projectName: label, runId });
  const adapter = createCleanupAdapter(databaseUrl);
  if (lease.staleOwner !== undefined) {
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

function createCleanupAdapter(databaseUrl) {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const requireFromApi = createRequire(
    fileURLToPath(new URL("../../apps/api/package.json", import.meta.url)),
  );
  return createPostgresCleanupAdapter({
    adminDatabaseUrl: databaseUrl,
    pg: requireFromApi("pg"),
    repositoryRoot,
  });
}
