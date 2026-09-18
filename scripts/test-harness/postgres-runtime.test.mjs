import assert from "node:assert/strict";
import test from "node:test";

import {
  installNonPostgresGuard,
  installPostgresTestRuntime,
} from "./postgres-runtime.mjs";
import { postgresProfile } from "./resource-budget.mjs";

function fakePg(queryEvents = []) {
  class FakeClient {
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
      super();
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

test("PostgreSQL project applies its test-only pool cap and registers it", () => {
  const events = [];
  const pg = fakePg();
  installPostgresTestRuntime({
    appendEvent: (event) => events.push(event),
    childProcess: fakeChildProcess(),
    pg,
    profile: postgresProfile("api-race"),
    projectName: "api-postgres-race",
  });
  const pool = new pg.Pool({ connectionString: "postgresql://example" });
  assert.equal(pool.options.max, 6);
  assert.ok(
    events.some(
      (event) => event.type === "pool-registered" && event.appliedMax === 6,
    ),
  );
  assert.throws(() => new pg.Pool({ max: 7 }), /above api-race cap=6/);
  assert.throws(() => {
    new pg.Pool();
    new pg.Pool();
    new pg.Pool();
    new pg.Pool();
  }, /exceeded poolCount=4/);
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
  });
  childProcess.execFileSync(process.execPath, ["prisma", "migrate", "deploy"], {
    env: { NODE_ENV: "test" },
  });
  assert.match(
    childProcess.syncCalls[0].options.env.NODE_OPTIONS,
    /child-postgres-hook\.mjs/,
  );
  childProcess.execFileSync(process.execPath, ["prisma", "migrate", "deploy"], {
    env: { VAYLET_TEST_RUN_ID: "run_explicit_env" },
  });
  assert.equal("NODE_ENV" in childProcess.syncCalls[1].options.env, false);

  const directChildren = fakeChildProcess();
  installPostgresTestRuntime({
    appendEvent: () => {},
    childProcess: directChildren,
    pg: fakePg(),
    profile: postgresProfile("database-direct"),
    projectName: "database-postgres-direct",
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
