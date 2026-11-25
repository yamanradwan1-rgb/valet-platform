import assert from "node:assert/strict";
import test from "node:test";

import { installPostgresTestRuntime } from "./postgres-runtime.mjs";
import { postgresProfile } from "./resource-budget.mjs";

const owner = "postgresql://fixture:secret@127.0.0.1:5432/valet";
const symbol = Symbol.for("vaylet.test.postgres.close-owned-pools");

function testRuntime(events) {
  class Client {
    constructor(config = {}) {
      const url = new URL(config.connectionString ?? owner);
      this.connectionParameters = {
        host: url.hostname,
        port: Number(url.port || 5432),
        database: url.pathname.slice(1),
      };
    }
    query() {
      return Promise.resolve({ rows: [] });
    }
    connect() {
      return Promise.resolve();
    }
    end() {
      return Promise.resolve();
    }
  }
  class Pool extends Client {
    constructor(config = {}) {
      super(config);
      this.options = config;
    }
  }
  const pg = { Client, Pool };
  installPostgresTestRuntime({
    appendEvent: (event) => events.push(event),
    childProcess: { spawn() {}, execFileSync() {} },
    pg,
    profile: postgresProfile("api-race"),
    projectName: "api-postgres-race",
    ownershipDatabaseUrl: owner,
  });
  return pg;
}

test("fixture startup cleanup closes only exact endpoint pools despite matching database names", async () => {
  const events = [];
  const pg = testRuntime(events);
  const owned = "valet_mob007_auth_123_abc123ef";
  const other = "valet_mob007_auth_123_abd123ef";
  const ownedUrl = `postgresql://fixture:test@localhost:5432/${owned}`;
  const poolA = new pg.Pool({ connectionString: ownedUrl, max: 2 });
  const poolB = new pg.Pool({
    connectionString: `postgres://other:secret@LOCALHOST/${owned}`,
    max: 2,
  });
  const unrelated = new pg.Pool({
    connectionString: `postgresql://fixture:test@localhost:5432/${other}`,
    max: 2,
  });
  const otherServer = new pg.Pool({
    connectionString: `postgresql://fixture:test@localhost:65432/${owned}`,
    max: 2,
  });
  const unsupported = new pg.Pool({
    connectionString: `mysql://fixture:test@localhost:5432/${owned}`,
    max: 2,
  });
  const close = globalThis[symbol];
  assert.equal(typeof close, "function");
  await assert.rejects(close(owned), /endpoint URL is invalid/);
  await assert.rejects(
    close(`mysql://fixture:test@localhost:5432/${owned}`),
    /endpoint URL is unsupported/,
  );
  await close(ownedUrl);
  assert.equal(
    events.filter((event) => event.type === "pool-released").length,
    2,
  );
  assert.equal(events.at(-1).activePools, 3);
  assert.equal(events.at(-1).reservedPoolConnections, 6);
  await Promise.all([unrelated.end(), otherServer.end(), unsupported.end()]);
  assert.equal(events.at(-1).reservedPoolConnections, 0);
  void poolA;
  void poolB;
});

test("fixture cleanup rejects an altered effective endpoint before closing any pools", async () => {
  const events = [];
  const pg = testRuntime(events);
  const target =
    "postgresql://test:masked@127.0.0.1:5432/valet_mob007_auth_123_abc123ef";
  const original = new pg.Pool({ connectionString: target, max: 1 });
  const unrelated = new pg.Pool({
    connectionString: target.replace(":5432/", ":65432/"),
    max: 1,
  });
  const close = globalThis[symbol];
  original.options.connectionString = unrelated.options.connectionString;
  await assert.rejects(close(target), /endpoint changed after registration/);
  assert.equal(
    events.filter((event) => event.type === "pool-released").length,
    0,
  );
  original.options.connectionString = target;
  await close(target);
  assert.equal(
    events.filter((event) => event.type === "pool-released").length,
    1,
  );
  await unrelated.end();
});
