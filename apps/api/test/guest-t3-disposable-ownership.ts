import pg from "pg";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface PostgresLease {
  readonly staleOwner?: unknown;
  readonly stateRoot: string;
}

interface OwnershipState {
  acquireClusterLease(input: {
    databaseUrl: string;
    projectName: string;
    runId: string;
  }): PostgresLease;
  createRunId(projectName: string): string;
  releaseClusterLease(input: {
    databaseUrl: string;
    runId: string;
    stateRoot: string;
  }): void;
}

interface OwnershipRouter {
  registerAttestedPostgresOwnershipTarget(input: {
    pg: typeof pg;
    databaseUrl: string;
    runId: string;
    stateRoot: string;
  }): () => void;
}

interface CleanupModules {
  cleanupOwnedRun(input: {
    adapter: unknown;
    databaseUrl: string;
    requireAttestedTarget: true;
    runId: string;
    stateRoot: string;
  }): Promise<unknown>;
  createPostgresCleanupAdapter(input: {
    adminDatabaseUrl: string;
    pg: typeof pg;
  }): unknown;
}

export interface DisposablePostgresOwnership {
  readonly runId: string;
  readonly cleanup: () => Promise<void>;
  readonly release: () => void;
}

// The W4 router and the global test hook live in the shared harness.
// Load only when the parent has an active PostgreSQL test run: standalone
// disposable tests do not create an unauthorized second ledger.
export async function acquireDisposablePostgresOwnership(
  adminUrl: string,
): Promise<DisposablePostgresOwnership | undefined> {
  const primaryRunId =
    process.env.VAYLET_TEST_RUN_ID ?? process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (primaryRunId === undefined) {
    if (
      process.env.GITHUB_ACTIONS === "true" ||
      process.env.VAYLET_TEST_PROJECT?.startsWith("api-postgres-") ||
      process.env.VAYLET_POSTGRES_PROFILE !== undefined
    ) {
      throw new Error("PostgreSQL fixture requires active harness ownership.");
    }
    return undefined;
  }

  const harness = (name: string) =>
    pathToFileURL(resolve(process.cwd(), "../../scripts/test-harness", name))
      .href;
  const state = (await import(
    harness("ownership-state.mjs")
  )) as OwnershipState;
  const router = (await import(
    harness("postgres-ownership-target-router.mjs")
  )) as OwnershipRouter;
  const runId = state.createRunId("api-w3-disposable");
  const lease = state.acquireClusterLease({
    databaseUrl: adminUrl,
    projectName: process.env.VAYLET_TEST_PROJECT ?? "api-postgres-standard",
    runId,
  });
  const leaseInput = {
    databaseUrl: adminUrl,
    runId,
    stateRoot: lease.stateRoot,
  };
  if (lease.staleOwner !== undefined) {
    state.releaseClusterLease(leaseInput);
    throw new Error(
      "Disposable PostgreSQL port has unresolved prior ownership.",
    );
  }
  let unregister: (() => void) | undefined;
  try {
    unregister = router.registerAttestedPostgresOwnershipTarget({
      pg,
      ...leaseInput,
    });
  } catch (error) {
    state.releaseClusterLease(leaseInput);
    throw error;
  }

  return {
    runId,
    cleanup: async () => {
      const modules = (await import(
        harness("postgres-cleanup-adapter.mjs")
      )) as CleanupModules;
      const cleanup = (await import(
        harness("owned-cleanup.mjs")
      )) as CleanupModules;
      const adapter = modules.createPostgresCleanupAdapter({
        adminDatabaseUrl: adminUrl,
        pg,
      });
      await cleanup.cleanupOwnedRun({
        adapter,
        ...leaseInput,
        requireAttestedTarget: true,
      });
    },
    release: () => {
      state.releaseClusterLease(leaseInput);
      unregister();
    },
  };
}
