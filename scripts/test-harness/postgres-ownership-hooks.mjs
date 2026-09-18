const ownershipInstallSymbol = Symbol.for(
  "vaylet.test.postgres.ownership-runtime.installed",
);

export function installPostgresOwnershipRuntime({ appendEvent, pg }) {
  if (pg[ownershipInstallSymbol]) return;
  pg[ownershipInstallSymbol] = true;
  patchPostgresOwnershipQueries({ appendEvent, pg });
}

export function patchPostgresOwnershipQueries({
  appendEvent,
  connectionLimit,
  pg,
}) {
  patchQuery(pg.Pool.prototype, appendEvent, connectionLimit);
  patchQuery(pg.Client.prototype, appendEvent, connectionLimit);
}

function patchQuery(prototype, appendEvent, connectionLimit) {
  const originalQuery = prototype.query;
  prototype.query = function ownershipQuery(...args) {
    const text = queryText(args[0]);
    const created = text === undefined ? [] : createdResources(text);
    const dropped = text === undefined ? [] : droppedResources(text);
    const action = originalQuery.bind(this);
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
