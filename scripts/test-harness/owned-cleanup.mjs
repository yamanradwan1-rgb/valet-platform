import {
  assertClusterLeaseOwner,
  isProcessAlive,
  readOwnershipEvents,
  removeRunState,
} from "./ownership-state.mjs";
import { postgresEndpointIdentity } from "./postgres-endpoint.mjs";
import { URL } from "node:url";
import { isIssue463SharedRole } from "./issue463-shared-role-policy.mjs";

const sharedProtectedRoles = new Set([
  "vap1_proof_owner",
  "vaylet_staff_session_lock_owner",
  "vaylet_management_writer",
  "vaylet_staff_auth_writer",
  "vaylet_mfa_writer",
]);
import { preflightIssue215BeforeHarnessCleanup } from "./issue215-target-preflight.mjs";
import { ISSUE215_PROJECT } from "./issue215-test-manifest.mjs";

export function hasIssue215OwnedResources(events) {
  return events.some(
    (event) =>
      event.type === "issue215-protected-run" ||
      (["resource-created", "resource-planned"].includes(event.type) &&
        ((event.kind === "database" &&
          /^vlt_t_db_215_[a-f0-9]{32}$/.test(event.name)) ||
          (event.kind === "role" &&
            /^vlt_t_role_215_[a-f0-9]{32}$/.test(event.name)))),
  );
}

export function buildOwnedCleanupPlan(events) {
  const resources = new Map();
  const children = new Map();
  const coordinatorChildren = new Map();
  for (const event of events) {
    if (
      event.type === "resource-created" ||
      (event.type === "resource-planned" && event.absentBeforeCreate === true)
    ) {
      resources.set(`${event.kind}:${event.name}`, {
        kind: event.kind,
        name: event.name,
        dropped: false,
      });
    } else if (event.type === "resource-dropped") {
      const key = `${event.kind}:${event.name}`;
      const resource = resources.get(key);
      if (resource !== undefined) resource.dropped = true;
    } else if (event.type === "child-started") {
      children.set(event.pid, {
        pid: event.pid,
        processIdentity: event.processIdentity,
        startedAt: event.at,
        exited: false,
      });
    } else if (event.type === "child-exited") {
      const child = children.get(event.pid);
      if (child !== undefined) child.exited = true;
    } else if (event.type === "coordinator-child-started") {
      coordinatorChildren.set(event.pid, {
        pid: event.pid,
        processIdentity: event.processIdentity,
        startedAt: event.at,
        exited: false,
      });
    } else if (event.type === "coordinator-child-exited") {
      const child = coordinatorChildren.get(event.pid);
      if (child !== undefined) child.exited = true;
    }
  }
  return {
    databases: [...resources.values()].filter(
      (item) => item.kind === "database" && !item.dropped,
    ),
    roles: [...resources.values()].filter(
      (item) => item.kind === "role" && !item.dropped,
    ),
    children: [...children.values()].filter((item) => !item.exited),
    coordinatorChildren: [...coordinatorChildren.values()].filter(
      (item) => !item.exited,
    ),
  };
}

export async function cleanupOwnedRun({
  adapter,
  databaseUrl,
  preserveRunState = false,
  recoverCoordinatorChildren = false,
  requireAttestedTarget = false,
  runId,
  stateRoot,
}) {
  const initialPlan = buildOwnedCleanupPlan(
    readOwnershipEvents({ databaseUrl, runId, stateRoot }),
  );
  assertSafeCleanupPlan(initialPlan, databaseUrl, requireAttestedTarget);
  if (requireAttestedTarget) {
    if (
      adapter?.ownershipEndpoint !== postgresEndpointIdentity(databaseUrl).key
    ) {
      throw new Error("Attested PostgreSQL cleanup adapter endpoint mismatch.");
    }
    assertClusterLeaseOwner({ databaseUrl, runId, stateRoot });
  }
  // An unrelated project's global setup may recover a stale P1 run before
  // the P1 global setup starts during direct mixed Vitest execution. Never
  // terminate its child or DROP any task-owned P1 artifact without attesting
  // the actual Issue215 target, even when the new project was not selected.
  if (
    hasIssue215OwnedResources(
      readOwnershipEvents({ databaseUrl, runId, stateRoot }),
    )
  ) {
    await preflightIssue215BeforeHarnessCleanup([ISSUE215_PROJECT]);
  }
  const childCount = await quiesceOwnedChildren({
    adapter,
    databaseUrl,
    recoverCoordinatorChildren,
    runId,
    stateRoot,
  });
  const postQuiescenceEvents = readOwnershipEvents({
    databaseUrl,
    runId,
    stateRoot,
  });
  if (hasIssue215OwnedResources(postQuiescenceEvents)) {
    await preflightIssue215BeforeHarnessCleanup([ISSUE215_PROJECT]);
  }
  const plan = buildOwnedCleanupPlan(postQuiescenceEvents);
  assertSafeCleanupPlan(plan, databaseUrl, requireAttestedTarget);
  if (requireAttestedTarget) {
    assertClusterLeaseOwner({ databaseUrl, runId, stateRoot });
  }
  for (const database of plan.databases) {
    if (requireAttestedTarget)
      assertClusterLeaseOwner({ databaseUrl, runId, stateRoot });
    await adapter.dropDatabase(database.name);
  }
  for (const role of plan.roles) {
    if (requireAttestedTarget)
      assertClusterLeaseOwner({ databaseUrl, runId, stateRoot });
    await adapter.dropRole(role.name);
  }

  const databases = await adapter.findExistingDatabases(
    plan.databases.map((item) => item.name),
  );
  const roles = await adapter.findExistingRoles(
    plan.roles.map((item) => item.name),
  );
  if (databases.length > 0 || roles.length > 0) {
    throw new Error(
      `Owned PostgreSQL cleanup incomplete for ${runId}: databases=${databases.join(",") || "none"}, ` +
        `roles=${roles.join(",") || "none"}.`,
    );
  }
  if (!preserveRunState) removeRunState({ databaseUrl, runId, stateRoot });
  return {
    childCount,
    databaseCount: plan.databases.length,
    roleCount: plan.roles.length,
  };
}

function assertSafeCleanupPlan(plan, databaseUrl, requireAttestedTarget) {
  const parsed = new URL(databaseUrl);
  const adminRole = decodeURIComponent(parsed.username);
  const adminDatabase = postgresEndpointIdentity(databaseUrl).database;
  if (
    plan.roles.some((role) => role.name === adminRole) ||
    plan.databases.some((database) => database.name === adminDatabase)
  ) {
    throw new Error(
      "PostgreSQL cleanup cannot drop its own administrative identity.",
    );
  }
  // A run or stale-owner ledger cannot prove ownership over these fixed
  // cluster principals. Reject even with an attested target rather than
  // dropping a role that another test database still depends upon.
  if (plan.roles.some((role) => isIssue463SharedRole(role.name))) {
    throw new Error(
      "PostgreSQL cleanup refuses Issue463 cluster-owned shared roles.",
    );
  }
  if (
    !requireAttestedTarget &&
    plan.roles.some((role) => sharedProtectedRoles.has(role.name))
  ) {
    throw new Error(
      "PostgreSQL cleanup refuses protected shared roles from an unattested ownership ledger.",
    );
  }
}

async function quiesceOwnedChildren({
  adapter,
  databaseUrl,
  recoverCoordinatorChildren,
  runId,
  stateRoot,
}) {
  const reused = new Set();
  const seen = new Set();
  for (let round = 0; round < 5; round += 1) {
    const plan = buildOwnedCleanupPlan(
      readOwnershipEvents({ databaseUrl, runId, stateRoot }),
    );
    const children = recoverCoordinatorChildren
      ? [...plan.children, ...plan.coordinatorChildren]
      : plan.children;
    const live = children.filter(
      (child) => isProcessAlive(child.pid) && !reused.has(child.pid),
    );
    if (live.length === 0) return seen.size;
    for (const child of live) {
      seen.add(child.pid);
      const owned = await adapter.killProcess(
        child.pid,
        child.startedAt,
        child.processIdentity,
      );
      if (owned === false) reused.add(child.pid);
    }
  }
  throw new Error(`Owned test child processes did not quiesce for ${runId}.`);
}
