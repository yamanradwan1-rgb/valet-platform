import { createRequire } from "node:module";
import { resolve } from "node:path";

import { cleanupOwnedRun } from "./owned-cleanup.mjs";
import {
  acquireClusterLease,
  assertClusterLeaseOwner,
  createRunId,
  releaseClusterLease,
} from "./ownership-state.mjs";
import { testDatabaseUrl } from "./invocation-lease.mjs";
import {
  createPostgresCleanupAdapter,
  readClusterBudgetSettings,
} from "./postgres-cleanup-adapter.mjs";
import {
  assertPostgresBudget,
  postgresProfileForProject,
  supportedWorkerCount,
} from "./resource-budget.mjs";

const adminDatabaseUrl = testDatabaseUrl();

export default async function setup(project) {
  const projectName = project?.name ?? project?.config?.name;
  if (typeof projectName !== "string" || projectName === "") {
    throw new Error(
      "PostgreSQL Vitest global setup could not resolve the project name.",
    );
  }
  const profile = postgresProfileForProject(projectName);
  const inheritedRunId = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (inheritedRunId !== undefined) {
    assertClusterLeaseOwner({
      databaseUrl: adminDatabaseUrl,
      runId: inheritedRunId,
    });
  }
  const runId = inheritedRunId ?? createRunId(projectName);
  const startedAt = Date.now();
  const lease =
    inheritedRunId === undefined
      ? acquireClusterLease({
          databaseUrl: adminDatabaseUrl,
          projectName,
          runId,
        })
      : { stateRoot: undefined, staleOwner: undefined };
  const requireFromPackage = createRequire(
    resolve(process.cwd(), "package.json"),
  );
  const pg = requireFromPackage("pg");
  const adapter = createPostgresCleanupAdapter({ adminDatabaseUrl, pg });

  if (lease.staleOwner !== undefined) {
    const recoveryRunIds = [
      lease.staleOwner.runId,
      ...(lease.staleOwner.recoveryRunIds ?? []),
    ];
    for (const recoveryRunId of [...new Set(recoveryRunIds)]) {
      await cleanupOwnedRun({
        adapter,
        databaseUrl: adminDatabaseUrl,
        recoverCoordinatorChildren: true,
        runId: recoveryRunId,
        stateRoot: lease.stateRoot,
      });
    }
  }

  const settings = await readClusterBudgetSettings({ adminDatabaseUrl, pg });
  const budget = assertPostgresBudget({
    ...settings,
    profile,
    workers: profile.fileWorkers,
  });
  const supported = supportedWorkerCount({ ...settings, profile });
  process.env.VAYLET_TEST_PROJECT = projectName;
  process.env.VAYLET_POSTGRES_PROFILE = profile.name;
  process.env.VAYLET_TEST_RUN_ID = runId;

  console.log(
    `[postgres-harness] project=${projectName} profile=${profile.name} workers=${profile.fileWorkers} ` +
      `supported=${supported} max=${budget.maxConnections} reserved=${budget.reservedSlots} ` +
      `nonTest=${budget.nonTestAllowance} envelope=${profile.connectionEnvelope} ` +
      `admitted=${budget.admittedConnections} headroom=${budget.headroom}`,
  );

  return async () => {
    const cleanup = await cleanupOwnedRun({
      adapter,
      databaseUrl: adminDatabaseUrl,
      preserveRunState: inheritedRunId !== undefined,
      runId,
      stateRoot: lease.stateRoot,
    });
    if (inheritedRunId === undefined) {
      releaseClusterLease({
        databaseUrl: adminDatabaseUrl,
        runId,
        stateRoot: lease.stateRoot,
      });
    }
    console.log(
      `[postgres-harness] cleanup run=${runId} db=${cleanup.databaseCount} roles=${cleanup.roleCount} ` +
        `children=${cleanup.childCount} wallMs=${Date.now() - startedAt}`,
    );
  };
}
