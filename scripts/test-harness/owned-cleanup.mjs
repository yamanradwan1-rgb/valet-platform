import {
  isProcessAlive,
  readOwnershipEvents,
  removeRunState,
} from "./ownership-state.mjs";

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
  runId,
  stateRoot,
}) {
  const childCount = await quiesceOwnedChildren({
    adapter,
    databaseUrl,
    recoverCoordinatorChildren,
    runId,
    stateRoot,
  });
  const plan = buildOwnedCleanupPlan(
    readOwnershipEvents({ databaseUrl, runId, stateRoot }),
  );
  for (const database of plan.databases)
    await adapter.dropDatabase(database.name);
  for (const role of plan.roles) await adapter.dropRole(role.name);

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
