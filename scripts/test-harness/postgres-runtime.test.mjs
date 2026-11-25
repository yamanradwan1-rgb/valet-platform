import assert from "node:assert/strict";
import test from "node:test";

import {
  installNonPostgresGuard,
  installPostgresTestRuntime,
} from "./postgres-runtime.mjs";
import { postgresProfile } from "./resource-budget.mjs";

function fakePg(queryEvents = []) {
  class FakeClient {
    constructor(config = {}) {
      const url = new URL(
        config.connectionString ??
          "postgresql://fixture:secret@127.0.0.1:5432/valet",
      );
      this.connectionParameters = {
        host: url.hostname,
        port: Number(url.port || 5432),
        database: url.pathname.slice(1),
      };
    }
    end() {
      return Promise.resolve();
    }
    connect() {
      return Promise.resolve();
    }
    query(sql) {
      queryEvents.push(sql);
      if (typeof sql === "string" && sql.startsWith("SELECT EXISTS")) {
        return Promise.resolve({ rows: [{ exists: false }] });
      }
      return Promise.resolve({ rows: [] });
    }
  }
  class FakePool extends FakeClient {
    constructor(config = {}) {
      super(config);
      this.options = config;
    }
  }
  return { Client: FakeClient, Pool: FakePool };
}

function fakeChildProcess() {
  const syncCalls = [];
  return {
    syncCalls,
    execFileSync(command, args, options) {
      syncCalls.push({ args, command, options });
      return Buffer.from("");
    },
    spawn() {
      return {
        pid: 12345,
        once() {
          return this;
        },
      };
    },
  };
}

test("race writer topology admits six distinct pools within the reserved slot budget", async () => {
  const events = [];
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: (event) => events.push(event),
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("api-race"),
    projectName: "api-postgres-race",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  const pool = new pg.Pool({ connectionString: "postgresql://example" });
  assert.equal(pool.options.max, 6);
  assert.ok(
    events.some(
      (event) => event.type === "pool-registered" && event.appliedMax === 6,
    ),
  );
  assert.throws(() => new pg.Pool({ max: 7 }), /above api-race cap=6/);
  const otherPools = [4, 2, 4, 2, 6].map((max) => new pg.Pool({ max }));
  assert.equal(otherPools.length + 1, postgresProfile("api-race").poolCount);
  assert.equal(events.at(-1).reservedPoolConnections, 24);
  assert.throws(() => new pg.Pool({ max: 1 }), /exceeded poolCount=6/);
  await otherPools[0].end();
  assert.equal(events.at(-1).reservedPoolConnections, 20);
  const replacement = new pg.Pool({ max: 4 });
  assert.equal(replacement.options.max, 4);
  await Promise.all([
    pool.end(),
    ...otherPools.slice(1).map((p) => p.end()),
    replacement.end(),
  ]);
  assert.equal(events.at(-1).reservedPoolConnections, 0);
});

test("race pool slots reject overcommit, then recover after asynchronous end", async () => {
  const events = [];
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: (event) => events.push(event),
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("api-race"),
    projectName: "api-postgres-race",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  const pools = Array.from({ length: 4 }, () => new pg.Pool({ max: 6 }));
  assert.throws(
    () => new pg.Pool({ max: 1 }),
    /exceeded poolConnectionBudget=24/,
  );
  assert.equal(
    events.filter((event) => event.type === "pool-registered").length,
    4,
  );
  await pools[0].end();
  const fifth = new pg.Pool({ max: 6 });
  assert.equal(events.at(-1).reservedPoolConnections, 24);
  await Promise.all([...pools.slice(1), fifth].map((pool) => pool.end()));
  assert.equal(events.at(-1).activePools, 0);
});

test("failed registration releases a constructed pool's reservation", async () => {
  const pg = fakePg();
  let rejectRegistration = true;
  const events = [];
  installPostgresTestRuntime({
    appendEvent: (event) => {
      if (event.type === "pool-registered" && rejectRegistration) {
        throw new Error("test ledger unavailable");
      }
      events.push(event);
    },
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("api-race"),
    projectName: "api-postgres-race",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  assert.throws(() => new pg.Pool({ max: 6 }), /ledger unavailable/);
  rejectRegistration = false;
  const pool = new pg.Pool({ max: 6 });
  assert.equal(events.at(-1).reservedPoolConnections, 6);
  assert.equal(events.at(-1).activePools, 1);
  await pool.end();
  assert.equal(events.at(-1).reservedPoolConnections, 0);
});

test("resource ownership is written before CREATE DATABASE executes", async () => {
  const order = [];
  const pg = fakePg(order);
  installPostgresTestRuntime({
    appendEvent: (event) =>
      order.push(
        event.type === "resource-planned"
          ? `planned:${event.name}`
          : event.type,
      ),
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("database-direct"),
    projectName: "database-postgres-direct",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  await new pg.Client().query('CREATE DATABASE "owned_before_create"');
  assert.deepEqual(order.slice(-3), [
    "planned:owned_before_create",
    'CREATE DATABASE "owned_before_create" CONNECTION LIMIT 11',
    "resource-created",
  ]);
});

test("unquoted runtime roles are tracked as owned resources", async () => {
  const events = [];
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: (event) => events.push(event),
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("database-provision"),
    projectName: "database-postgres-provision",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  await new pg.Client().query("CREATE ROLE valet_runtime_owned WITH LOGIN");
  assert.ok(
    events.some(
      (event) =>
        event.type === "resource-created" &&
        event.kind === "role" &&
        event.name === "valet_runtime_owned",
    ),
  );
});

test("direct client profile count is enforced across live connections", async () => {
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: () => {},
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("database-direct"),
    projectName: "database-postgres-direct",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  const clients = [new pg.Client(), new pg.Client(), new pg.Client()];
  await Promise.all(clients.map((client) => client.connect()));
  assert.throws(() => new pg.Client().connect(), /exceeded directClients=3/);
  await Promise.all(clients.map((client) => client.end()));
});

test("sync DB children consume the subprocess profile and inherit the ownership hook", () => {
  const childProcess = fakeChildProcess();
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: () => {},
    childProcess,
    pg,
    profile: postgresProfile("database-provision"),
    projectName: "database-postgres-provision",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  childProcess.execFileSync(process.execPath, ["prisma", "migrate", "deploy"], {
    env: { NODE_ENV: "test" },
  });
  assert.match(
    childProcess.syncCalls[0].options.env.NODE_OPTIONS,
    /child-postgres-hook\.mjs/,
  );
  assert.equal(
    childProcess.syncCalls[0].options.env.TEST_DATABASE_URL,
    "postgresql://fixture:secret@127.0.0.1:5432/valet",
  );
  childProcess.execFileSync(process.execPath, ["prisma", "migrate", "deploy"], {
    env: { VAYLET_TEST_RUN_ID: "run_explicit_env" },
  });
  assert.equal("NODE_ENV" in childProcess.syncCalls[1].options.env, false);
  const secondaryUrl = "postgresql://fixture:secret@127.0.0.1:55473/valet";
  childProcess.execFileSync(process.execPath, ["prisma", "migrate", "deploy"], {
    env: {
      VAYLET_TEST_RUN_ID: "run_secondary_attested",
      TEST_DATABASE_URL: secondaryUrl,
      MIGRATION_DATABASE_URL: secondaryUrl,
    },
  });
  assert.equal(
    childProcess.syncCalls[2].options.env.TEST_DATABASE_URL,
    secondaryUrl,
  );
  assert.equal(
    childProcess.syncCalls[2].options.env.VAYLET_TEST_RUN_ID,
    "run_secondary_attested",
  );

  const directChildren = fakeChildProcess();
  installPostgresTestRuntime({
    appendEvent: () => {},
    childProcess: directChildren,
    pg: fakePg(),
    profile: postgresProfile("database-direct"),
    projectName: "database-postgres-direct",
    ownershipDatabaseUrl: "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  assert.throws(
    () => directChildren.execFileSync(process.execPath, ["child.mjs"]),
    /exceeded subprocessMax=0/,
  );
});

test("non-PostgreSQL projects reject real query/connect while allowing lazy construction", () => {
  const pg = fakePg();
  const childProcess = fakeChildProcess();
  installNonPostgresGuard({
    childProcess,
    pg,
    projectName: "api-non-postgres",
  });
  const pool = new pg.Pool();
  assert.throws(
    () => pool.query("select 1"),
    /Real PostgreSQL access is forbidden/,
  );
  assert.throws(() => pool.connect(), /Real PostgreSQL access is forbidden/);
  assert.throws(
    () =>
      childProcess.execFileSync(process.execPath, [
        "prisma",
        "migrate",
        "deploy",
      ]),
    /Real PostgreSQL access is forbidden/,
  );
});
