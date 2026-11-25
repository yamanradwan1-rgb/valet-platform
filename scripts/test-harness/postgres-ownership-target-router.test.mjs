import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { patchPostgresOwnershipQueries } from "./postgres-ownership-hooks.mjs";
import { registerAttestedPostgresOwnershipTarget } from "./postgres-ownership-target-router.mjs";
import {
  acquireClusterLease,
  readOwnershipEvents,
  releaseClusterLease,
} from "./ownership-state.mjs";

const primaryUrl = "postgresql://fixture:secret@127.0.0.1:5432/valet";
const secondaryUrl = "postgresql://fixture:secret@127.0.0.1:55473/valet";

function fakePg() {
  const queries = [];
  class Client {
    constructor(config = {}) {
      const url = new URL(config.connectionString ?? primaryUrl);
      this.connectionParameters = {
        host: url.hostname,
        port: Number(url.port || 5432),
        database: url.pathname.slice(1),
      };
    }
    connect() {
      return Promise.resolve();
    }
    query(sql) {
      queries.push(sql);
      if (sql.startsWith("SELECT EXISTS")) {
        return Promise.resolve({ rows: [{ exists: false }] });
      }
      return Promise.resolve({ rows: [] });
    }
  }
  class Pool extends Client {
    constructor(config = {}) {
      super(config);
      this.options = config;
    }
  }
  return { pg: { Pool, Client }, queries };
}

test("unregistered PostgreSQL server is denied before connect or query, despite identical role/database names", async () => {
  const primaryEvents = [];
  const { pg, queries } = fakePg();
  patchPostgresOwnershipQueries({
    appendEvent: (event) => primaryEvents.push(event),
    pg,
    primaryDatabaseUrl: primaryUrl,
  });
  const secondary = new pg.Pool({ connectionString: secondaryUrl });
  assert.throws(
    () =>
      registerAttestedPostgresOwnershipTarget({
        pg,
        databaseUrl: "postgresql://other:secret@localhost:5432/valet",
        runId: "run_wrong_alias",
      }),
    /shares the primary ownership ledger/,
  );
  assert.throws(() => secondary.connect(), /not an owned cluster/);
  assert.throws(
    () => secondary.query("CREATE ROLE identical_role NOLOGIN"),
    /not an owned cluster/,
  );
  assert.throws(() => secondary.query("SELECT 1"), /not an owned cluster/);
  assert.deepEqual(queries, []);
  assert.deepEqual(primaryEvents, []);
});

test("attested secondary keeps identical role names in a separate cluster/run ledger", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "w4-pg-router-"));
  const runId = `run_w4_secondary_${randomUUID().replaceAll("-", "")}`;
  const primaryEvents = [];
  const { pg } = fakePg();
  let unregister;
  let leaseAcquired = false;
  try {
    patchPostgresOwnershipQueries({
      appendEvent: (event) => primaryEvents.push(event),
      pg,
      primaryDatabaseUrl: primaryUrl,
    });
    assert.throws(
      () =>
        registerAttestedPostgresOwnershipTarget({
          pg,
          databaseUrl: secondaryUrl,
          runId,
          stateRoot,
        }),
      /no active cluster ownership metadata/,
    );
    acquireClusterLease({
      databaseUrl: secondaryUrl,
      runId,
      projectName: "api-postgres-race",
      stateRoot,
    });
    leaseAcquired = true;
    unregister = registerAttestedPostgresOwnershipTarget({
      pg,
      databaseUrl: secondaryUrl,
      runId,
      stateRoot,
    });
    const primary = new pg.Client({ connectionString: primaryUrl });
    const secondary = new pg.Pool({ connectionString: secondaryUrl });
    await primary.query("CREATE ROLE identical_role NOLOGIN");
    await secondary.query("CREATE ROLE identical_role NOLOGIN");
    assert.deepEqual(
      primaryEvents
        .filter((event) => event.type === "resource-created")
        .map((event) => event.name),
      ["identical_role"],
    );
    assert.deepEqual(
      readOwnershipEvents({ databaseUrl: secondaryUrl, runId, stateRoot })
        .filter((event) => event.type === "resource-created")
        .map((event) => event.name),
      ["identical_role"],
    );
    assert.equal(
      primaryEvents.filter((event) => event.type === "resource-created").length,
      1,
    );
    const staleUnregister = unregister;
    staleUnregister();
    unregister = registerAttestedPostgresOwnershipTarget({
      pg,
      databaseUrl: secondaryUrl,
      runId,
      stateRoot,
    });
    staleUnregister();
    await secondary.query("SELECT 1");
    releaseClusterLease({ databaseUrl: secondaryUrl, runId, stateRoot });
    leaseAcquired = false;
    assert.throws(
      () => secondary.query("SELECT 1"),
      /no active cluster ownership metadata/,
    );
    unregister();
    unregister = undefined;
    assert.throws(
      () => secondary.query("DROP ROLE identical_role"),
      /not an owned cluster/,
    );
  } finally {
    unregister?.();
    if (leaseAcquired) {
      releaseClusterLease({ databaseUrl: secondaryUrl, runId, stateRoot });
    }
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
