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
  // Opting into W7 is an explicit local-cluster attestation across every
  // invocation route, including direct Vitest and package-wide runners.
  if (
    process.env.ISSUE414_W7_HTTP_TABS_PROFILE === "I_OWN_EXCLUSIVE_LOCAL_PG17"
  ) {
    const value = process.env.TEST_DATABASE_URL;
    if (!value) {
      throw new Error(
        "W7 HTTP profile requires explicit TEST_DATABASE_URL before lease acquisition.",
      );
    }
    let target;
    try {
      target = new URL(value);
    } catch {
      throw new Error("W7 HTTP profile refuses malformed TEST_DATABASE_URL.");
    }
    if (target.protocol !== "postgresql:" && target.protocol !== "postgres:") {
      throw new Error("W7 HTTP profile requires PostgreSQL URL.");
    }
    const port = Number(target.port);
    if (
      target.hostname !== "127.0.0.1" ||
      !Number.isInteger(port) ||
      port <= 1024 ||
      port > 65535 ||
      !target.username ||
      !target.password ||
      target.pathname.length <= 1 ||
      target.search ||
      target.hash ||
      process.env.NODE_ENV === "production"
    ) {
      throw new Error(
        "W7 HTTP profile requires an explicit loopback PG URL, safe port and database.",
      );
    }
    return value;
  }
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    DEFAULT_TEST_DATABASE_URL
  );
}

export async function acquireInvocationLease(
  label,
  { selectedProjects = [] } = {},
) {
  const databaseUrl = testDatabaseUrl();
  await preflightIssue215BeforeHarnessCleanup(selectedProjects);
  const inheritedRunId = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (inheritedRunId) {
    assertClusterLeaseOwner({ databaseUrl, runId: inheritedRunId });
    if (requiresIssue215Preflight(selectedProjects)) {
      appendOwnershipEvent({
        databaseUrl,
        runId: inheritedRunId,
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

  const runId = createRunId(label);
  const lease = acquireClusterLease({
    databaseUrl,
    projectName: label,
    runId,
    issue215Protected: requiresIssue215Preflight(selectedProjects),
  });
  if (requiresIssue215Preflight(selectedProjects)) {
    appendOwnershipEvent({
      databaseUrl,
      runId,
      event: { type: "issue215-protected-run" },
    });
  }
  const adapter = createCleanupAdapter(databaseUrl, label);
  if (lease.staleOwner !== undefined) {
    if (requiresIssue215StaleOwnerPreflight(lease.staleOwner)) {
      try {
        await preflightIssue215BeforeHarnessCleanup([
          "database-postgres-issue215",
        ]);
      } catch (error) {
        parkClusterLeaseForRecovery({
          databaseUrl,
          runId,
          stateRoot: lease.stateRoot,
        });
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
      const cleanup = await cleanupOwnedRun({
        adapter,
        databaseUrl,
        recoverCoordinatorChildren: true,
        runId,
      });
      delete process.env.VAYLET_TEST_CLUSTER_RUN_ID;
      releaseClusterLease({ databaseUrl, runId, stateRoot: lease.stateRoot });
      return cleanup;
    },
  };
}

function createCleanupAdapter(databaseUrl, label) {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const databaseInvocation =
    label === "database-package-tests" ||
    label === "focused-database" ||
    label.startsWith("postgres-projects-database-");
  const requireFromOwner = createRequire(
    fileURLToPath(
      new URL(
        databaseInvocation
          ? "../../packages/database/package.json"
          : "../../apps/api/package.json",
        import.meta.url,
      ),
    ),
  );
  return createPostgresCleanupAdapter({
    adminDatabaseUrl: databaseUrl,
    pg: requireFromOwner("pg"),
    repositoryRoot,
  });
}
