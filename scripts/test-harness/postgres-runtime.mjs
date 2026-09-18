import { syncBuiltinESMExports } from "node:module";

import { assertExecutableDatabaseAccessAllowed } from "./test-classification.mjs";
import { patchPostgresOwnershipQueries } from "./postgres-ownership-hooks.mjs";
import { linuxProcessIdentity } from "./process-identity.mjs";
const installSymbol = Symbol.for("vaylet.test.postgres.runtime.installed");
const childHookUrl = new URL("./child-postgres-hook.mjs", import.meta.url).href;

export function installPostgresTestRuntime({
  appendEvent,
  childProcess,
  pg,
  profile,
  projectName,
}) {
  if (pg[installSymbol]) return;
  pg[installSymbol] = true;
  const OriginalPool = pg.Pool;
  const OriginalClient = pg.Client;
  patchPostgresOwnershipQueries({
    appendEvent,
    connectionLimit: profile.connectionEnvelope,
    pg,
  });

  let activePools = 0;
  let activeDirectClients = 0;
  class BoundedTestPool extends OriginalPool {
    #counted = false;

    constructor(config = {}) {
      const requested = config.max;
      if (requested !== undefined && requested > profile.poolMax) {
        throw new Error(
          `PostgreSQL test pool requested max=${requested} above ${profile.name} cap=${profile.poolMax}.`,
        );
      }
      if (activePools >= profile.poolCount) {
        throw new Error(
          `PostgreSQL test profile ${profile.name} exceeded poolCount=${profile.poolCount}.`,
        );
      }
      super({ ...config, max: requested ?? profile.poolMax });
      activePools += 1;
      this.#counted = true;
      appendEvent({
        type: "pool-registered",
        profile: profile.name,
        activePools,
        appliedMax: requested ?? profile.poolMax,
        requestedMax: requested ?? null,
      });
    }

    end(...args) {
      return withRelease(super.end.bind(this), args, () => {
        if (!this.#counted) return;
        this.#counted = false;
        activePools -= 1;
      });
    }
  }

  class BoundedTestClient extends OriginalClient {
    #counted = false;

    connect(...args) {
      if (!this.#counted) {
        if (activeDirectClients >= profile.directClients) {
          throw new Error(
            `PostgreSQL test profile ${profile.name} exceeded directClients=${profile.directClients}.`,
          );
        }
        activeDirectClients += 1;
        this.#counted = true;
        appendEvent({
          type: "client-registered",
          profile: profile.name,
          activeDirectClients,
        });
      }
      return withFailureRelease(super.connect.bind(this), args, () => {
        if (!this.#counted) return;
        this.#counted = false;
        activeDirectClients -= 1;
      });
    }

    end(...args) {
      return withRelease(super.end.bind(this), args, () => {
        if (!this.#counted) return;
        this.#counted = false;
        activeDirectClients -= 1;
      });
    }
  }

  pg.Pool = BoundedTestPool;
  pg.Client = BoundedTestClient;
  patchSpawn({ appendEvent, childProcess, profile });
  appendEvent({
    type: "profile-registered",
    profile: profile.name,
    projectName,
  });
}

export function installNonPostgresGuard({ childProcess, pg, projectName }) {
  if (pg[installSymbol]) return;
  pg[installSymbol] = true;
  const guard = () => assertExecutableDatabaseAccessAllowed(projectName);
  for (const prototype of [pg.Pool.prototype, pg.Client.prototype]) {
    const originalConnect = prototype.connect;
    const originalQuery = prototype.query;
    prototype.connect = function guardedConnect(...args) {
      guard();
      return originalConnect.apply(this, args);
    };
    prototype.query = function guardedQuery(...args) {
      guard();
      return originalQuery.apply(this, args);
    };
  }
  const originalSpawn = childProcess.spawn;
  const originalExecFileSync = childProcess.execFileSync;
  childProcess.spawn = function guardedSpawn(command, args = [], options = {}) {
    const normalized = normalizeSpawn(args, options);
    const text = `${String(command)} ${normalized.args.join(" ")}`;
    if (isPostgresSetupCommand(text)) guard();
    return originalSpawn.call(
      this,
      command,
      normalized.args,
      normalized.options,
    );
  };
  childProcess.execFileSync = function guardedExecFileSync(
    command,
    args = [],
    options = {},
  ) {
    const normalized = normalizeSpawn(args, options);
    const text = `${String(command)} ${normalized.args.join(" ")}`;
    if (isPostgresSetupCommand(text)) guard();
    return originalExecFileSync.call(
      this,
      command,
      normalized.args,
      normalized.options,
    );
  };
  syncBuiltinESMExports();
}

function patchSpawn({ appendEvent, childProcess, profile }) {
  const originalSpawn = childProcess.spawn;
  const originalExecFileSync = childProcess.execFileSync;
  let activeChildren = 0;
  childProcess.spawn = function ownedSpawn(command, args = [], options = {}) {
    if (activeChildren >= profile.subprocessMax) {
      throw new Error(
        `PostgreSQL test profile ${profile.name} exceeded subprocessMax=${profile.subprocessMax}.`,
      );
    }
    const normalized = normalizeSpawn(args, options);
    const text = `${String(command)} ${normalized.args.join(" ")}`;
    const childOptions = injectChildHook(normalized.options, profile, false);
    activeChildren += 1;
    let child;
    try {
      child = originalSpawn.call(this, command, normalized.args, childOptions);
    } catch (error) {
      activeChildren -= 1;
      throw error;
    }
    if (Number.isInteger(child.pid)) {
      appendEvent({
        type: "child-started",
        pid: child.pid,
        processIdentity:
          process.platform === "linux"
            ? linuxProcessIdentity(child.pid)
            : undefined,
        command: safeCommand(text),
      });
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeChildren -= 1;
      if (Number.isInteger(child.pid)) {
        appendEvent({ type: "child-exited", pid: child.pid });
      }
    };
    child.once("exit", release);
    child.once("error", release);
    return child;
  };
  childProcess.execFileSync = function ownedExecFileSync(
    command,
    args = [],
    options = {},
  ) {
    if (activeChildren >= profile.subprocessMax) {
      throw new Error(
        `PostgreSQL test profile ${profile.name} exceeded subprocessMax=${profile.subprocessMax}.`,
      );
    }
    const normalized = normalizeSpawn(args, options);
    activeChildren += 1;
    try {
      return originalExecFileSync.call(
        this,
        command,
        normalized.args,
        injectChildHook(normalized.options, profile, true),
      );
    } finally {
      activeChildren -= 1;
    }
  };
  syncBuiltinESMExports();
}

function injectChildHook(options, profile, selfLedger) {
  const environment =
    options.env === undefined ? { ...process.env } : { ...options.env };
  const existing = environment.NODE_OPTIONS ?? "";
  const hook = `--import=${childHookUrl}`;
  if (!existing.includes(childHookUrl)) {
    environment.NODE_OPTIONS = `${existing} ${hook}`.trim();
  }
  environment.VAYLET_TEST_POSTGRES_CONNECTION_LIMIT = String(
    profile.subprocessReserve,
  );
  if (selfLedger) environment.VAYLET_SELF_LEDGER_CHILD = "1";
  else delete environment.VAYLET_SELF_LEDGER_CHILD;
  return { ...options, env: environment };
}

function normalizeSpawn(args, options) {
  return Array.isArray(args)
    ? { args, options: options ?? {} }
    : { args: [], options: args ?? {} };
}

function isPostgresSetupCommand(text) {
  return /(?:migrate:deploy|runtime:provision|run-migrate-deploy|provision-runtime-role|prisma\s+migrate)/i.test(
    text,
  );
}

function safeCommand(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[REDACTED]")
    .slice(0, 240);
}

function withRelease(action, args, release) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  if (callbackIndex >= 0) {
    const nextArgs = [...args];
    const callback = nextArgs[callbackIndex];
    nextArgs[callbackIndex] = (...values) => {
      release();
      callback(...values);
    };
    return action(...nextArgs);
  }
  const result = action(...args);
  return result && typeof result.finally === "function"
    ? result.finally(release)
    : result;
}

function withFailureRelease(action, args, release) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  if (callbackIndex >= 0) {
    const nextArgs = [...args];
    const callback = nextArgs[callbackIndex];
    nextArgs[callbackIndex] = (error, ...values) => {
      if (error != null) release();
      callback(error, ...values);
    };
    return action(...nextArgs);
  }
  try {
    const result = action(...args);
    return result && typeof result.catch === "function"
      ? result.catch((error) => {
          release();
          throw error;
        })
      : result;
  } catch (error) {
    release();
    throw error;
  }
}
