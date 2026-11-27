import { createHash } from "node:crypto";
import { createPostgresOwnershipRouter } from "./postgres-ownership-target-router.mjs";
import {
  assertReviewedIssue463P2Source,
  executePinnedIssue463Migration,
  isIssue463P2Source,
} from "./issue463-pinned-migration.mjs";
import {
  isIssue463SharedRole,
} from "./issue463-shared-role-policy.mjs";

// These exact migrations verify their cluster-scoped NOLOGIN owners.
// The isolated service provisions them before scratch migrations fan out.
const pinnedSharedRoles = new Map([
  [
    "vap1_proof_owner",
    "4978f3388b650211a6d588af0c67dcd46a0e31cc2bbecda2589338b44aafffba",
  ],
  [
    "vaylet_staff_session_lock_owner",
    "4a7c9fb4ee924a9b350cce8948b41fcbfd254b745c26346eaebd2906e617686d",
  ],
]);

const ownershipInstallSymbol = Symbol.for(
  "vaylet.test.postgres.ownership-runtime.installed",
);

export function installPostgresOwnershipRuntime({
  appendEvent,
  pg,
  primaryDatabaseUrl,
}) {
  if (pg[ownershipInstallSymbol]) return;
  pg[ownershipInstallSymbol] = true;
  patchPostgresOwnershipQueries({ appendEvent, pg, primaryDatabaseUrl });
}

export function patchPostgresOwnershipQueries({
  appendEvent,
  connectionLimit,
  pg,
  primaryDatabaseUrl,
}) {
  const router = createPostgresOwnershipRouter({
    pg,
    primaryDatabaseUrl,
    appendPrimaryEvent: appendEvent,
  });
  patchQuery(pg.Pool.prototype, router, connectionLimit);
  patchQuery(pg.Client.prototype, router, connectionLimit);
  patchConnect(pg.Pool.prototype, router);
  patchConnect(pg.Client.prototype, router);
}

function patchConnect(prototype, router) {
  const original = prototype.connect;
  prototype.connect = function ownershipConnect(...args) {
    router.resolve(this);
    return original.apply(this, args);
  };
}

function patchQuery(prototype, router, connectionLimit) {
  const originalQuery = prototype.query;
  prototype.query = function ownershipQuery(...args) {
    const appendEvent = router.resolve(this);
    const text = queryText(args[0]);
    const created = text === undefined ? [] : createdResources(text);
    const dropped = text === undefined ? [] : droppedResources(text);
    const action = originalQuery.bind(this);
    // P2's fixed cluster-wide principals cannot be claimed by one scratch DB
    // or adopted via the regular absence-proven cleanup ledger. A future
    // exception requires W2's final, exact pinned SQL and a verified CI-owned
    // role inventory, as for the two existing pinned shared owner migrations.
    if (isIssue463P2Source(text)) {
      assertReviewedIssue463P2Source(text);
      return executePinnedIssue463Migration(action, args);
    }
    if (created.some((resource) =>
      resource.kind === "role" && isIssue463SharedRole(resource.name))) {
      throw new Error(
        "Issue463 shared roles require a reviewed pinned migration and " +
        "pre-attested cluster role reuse; refusing per-test role creation.",
      );
    }
    if (dropped.some((resource) =>
      resource.kind === "role" && isIssue463SharedRole(resource.name))) {
      throw new Error(
        "Issue463 shared roles are cluster-owned; refusing per-test DROP ROLE.",
      );
    }
    if (isPinnedSharedRoleMigration(text, created)) {
      return executePinnedSharedRoleMigration(action, args, created[0]);
    }
    if (created.length > 0) {
      return executeOwnedCreate({
        action,
        appendEvent,
        args,
        connectionLimit,
        created,
      });
    }
    return withSuccessfulResult(action, args, () => {
      for (const resource of dropped) {
        appendEvent({ type: "resource-dropped", ...resource });
      }
    });
  };
}

function isPinnedSharedRoleMigration(text, created) {
  if (
    text === undefined ||
    created.length !== 1 ||
    created[0].kind !== "role" ||
    !pinnedSharedRoles.has(created[0].name)
  )
    return false;
  return (
    createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex") ===
    pinnedSharedRoles.get(created[0].name)
  );
}

function executePinnedSharedRoleMigration(action, args, role) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  const callback = callbackIndex < 0 ? undefined : args[callbackIndex];
  const queryArgs =
    callbackIndex < 0
      ? args
      : args.filter((_, index) => index !== callbackIndex);
  const operation = (async () => {
    if (!(await resourceExists(action, role))) {
      throw new Error(
        "Pinned migration requires a pre-attested shared CI proof owner; refusing unowned global role CREATE.",
      );
    }
    // The exact pinned SQL checks NOLOGIN/NOINHERIT and membership safety
    // before creating any private schema object.
    return action(...queryArgs);
  })();
  if (callback === undefined) return operation;
  operation.then(
    (result) => callback(null, result),
    (error) => callback(error),
  );
  return undefined;
}

function executeOwnedCreate({
  action,
  appendEvent,
  args,
  connectionLimit,
  created,
}) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  const callback = callbackIndex >= 0 ? args[callbackIndex] : undefined;
  const queryArgs =
    callbackIndex >= 0
      ? args.filter((_, index) => index !== callbackIndex)
      : args;
  const operation = (async () => {
    for (const resource of created) {
      const existed = await resourceExists(action, resource);
      appendEvent({
        type: "resource-planned",
        ...resource,
        absentBeforeCreate: !existed,
      });
      if (existed) {
        throw new Error(
          `Refusing to create test-owned ${resource.kind} ${resource.name}: the resource already exists.`,
        );
      }
    }
    try {
      const result = await action(
        ...applyDatabaseConnectionLimit(queryArgs, created, connectionLimit),
      );
      for (const resource of created) {
        appendEvent({ type: "resource-created", ...resource });
      }
      return result;
    } catch (error) {
      for (const resource of created) {
        appendEvent({ type: "resource-create-failed", ...resource });
      }
      throw error;
    }
  })();
  if (callback === undefined) return operation;
  operation.then(
    (result) => callback(null, result),
    (error) => callback(error),
  );
  return undefined;
}

async function resourceExists(action, resource) {
  const table = resource.kind === "database" ? "pg_database" : "pg_roles";
  const column = resource.kind === "database" ? "datname" : "rolname";
  const result = await action(
    `SELECT EXISTS (SELECT 1 FROM ${table} WHERE ${column}=$1) AS exists`,
    [resource.name],
  );
  return result.rows[0]?.exists === true;
}

function applyDatabaseConnectionLimit(args, created, connectionLimit) {
  if (
    !Number.isInteger(connectionLimit) ||
    connectionLimit < 1 ||
    !created.some((resource) => resource.kind === "database")
  ) {
    return args;
  }
  const text = queryText(args[0]);
  if (text === undefined || /\bCONNECTION\s+LIMIT\b/i.test(text)) return args;
  const bounded = appendConnectionLimit(text, connectionLimit);
  if (typeof args[0] === "string") return [bounded, ...args.slice(1)];
  return [{ ...args[0], text: bounded }, ...args.slice(1)];
}

function appendConnectionLimit(text, connectionLimit) {
  const trailingWhitespace = text.match(/\s*$/)?.[0] ?? "";
  const trimmed = text.slice(0, text.length - trailingWhitespace.length);
  const semicolon = trimmed.endsWith(";");
  const base = semicolon ? trimmed.slice(0, -1) : trimmed;
  return `${base} CONNECTION LIMIT ${connectionLimit}${semicolon ? ";" : ""}${trailingWhitespace}`;
}

function createdResources(sql) {
  return extractResources(sql, [
    ["database", /CREATE\s+DATABASE\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi],
    ["role", /CREATE\s+(?:ROLE|USER)\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi],
  ]);
}

function droppedResources(sql) {
  return extractResources(sql, [
    [
      "database",
      /DROP\s+DATABASE(?:\s+IF\s+EXISTS)?\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi,
    ],
    [
      "role",
      /DROP\s+ROLE(?:\s+IF\s+EXISTS)?\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi,
    ],
  ]);
}

function extractResources(sql, patterns) {
  const resources = [];
  for (const [kind, expression] of patterns) {
    for (const match of sql.matchAll(expression)) {
      resources.push({ kind, name: match[1] ?? match[2] });
    }
  }
  return resources;
}

function queryText(value) {
  if (typeof value === "string") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.text === "string"
  ) {
    return value.text;
  }
  return undefined;
}

function withSuccessfulResult(action, args, onSuccess) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  if (callbackIndex >= 0) {
    const nextArgs = [...args];
    const callback = nextArgs[callbackIndex];
    nextArgs[callbackIndex] = (error, ...values) => {
      if (error == null) onSuccess();
      callback(error, ...values);
    };
    return action(...nextArgs);
  }
  const result = action(...args);
  if (result && typeof result.then === "function") {
    return result.then((value) => {
      onSuccess();
      return value;
    });
  }
  return result;
}
