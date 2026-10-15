import { describe, expect, it } from "vitest";

import {
  assertIssue215DockerTarget,
  assertIssue215LiveIdentity,
} from "../../../packages/database/src/condition-photo-p1-test-target.mjs";
import { recoveryDatabaseIsExplicitlyOwned } from "./issue215-recovery-target";

const valid = {
  NODE_ENV: "test",
  TEST_DATABASE_URL: "postgresql://issue215_owner:fixture@127.0.0.1:58487/issue215_empty",
  VAYLET_TEST_PROJECT: "api-postgres-issue215",
  VAYLET_TEST_RUN_ID: "reviewed-lease",
  ISSUE215_DISPOSABLE_PG_CONFIRMED: "YES",
};
const docker = {
  Id: "9e5631c9cbd28ed1885923e2bfdd2ae3442f25bc3fa63f80b57c8327bf4c46cc",
  Name: "/vaylet_issue215_p1_local",
  Config: {
    Image: "postgres:16-alpine",
    Env: ["POSTGRES_USER=issue215_owner", "POSTGRES_DB=issue215_empty"],
  },
  State: { Status: "running" },
  NetworkSettings: {
    Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58487" }] },
  },
  Mounts: [{
    Type: "volume",
    Name: "83d0792c7318ace85d94f3824619542a4f8344226b0ff16d091d307e428dc72e",
    Destination: "/var/lib/postgresql/data",
  }],
};
const live = {
  database: "issue215_empty",
  actor: "issue215_owner",
  session_role: "issue215_owner",
  database_owner: "issue215_owner",
  port: 5432,
  recovery: false,
  can_create_db: true,
  can_create_role: true,
  accepts_connections: true,
  version: 160000,
};

describe("#285 irreversible PostgreSQL fixture lifecycle target gate", () => {
  it("requires both protected project and explicit local opt-in", () => {
    expect(recoveryDatabaseIsExplicitlyOwned(valid)).toBe(true);
    expect(recoveryDatabaseIsExplicitlyOwned({
      ...valid, VAYLET_TEST_PROJECT: "api-postgres-race",
    })).toBe(false);
    expect(() => recoveryDatabaseIsExplicitlyOwned({
      ...valid, ISSUE215_DISPOSABLE_PG_CONFIRMED: undefined,
    })).toThrow(/explicit disposable PostgreSQL opt-in/);
  });

  it.each([
    ["arbitrary local database", { TEST_DATABASE_URL:
      "postgresql://valet:password@127.0.0.1:5432/valet" }],
    ["same port wrong database", { TEST_DATABASE_URL:
      valid.TEST_DATABASE_URL.replace("issue215_empty", "valet") }],
    ["same port wrong user", { TEST_DATABASE_URL:
      valid.TEST_DATABASE_URL.replace("issue215_owner", "postgres") }],
    ["same database wrong port", { TEST_DATABASE_URL:
      valid.TEST_DATABASE_URL.replace("58487", "5432") }],
    ["same database different hostname", { TEST_DATABASE_URL:
      valid.TEST_DATABASE_URL.replace("127.0.0.1", "localhost") }],
    ["URL query options", { TEST_DATABASE_URL: `${valid.TEST_DATABASE_URL}?options=-csearch_path%3Dunsafe` }],
    ["unprotected project spoof", { VAYLET_TEST_PROJECT: "api-postgres-issue215-mock" }],
    ["missing lease", { VAYLET_TEST_RUN_ID: undefined }],
    ["ambient libpq options", { PGOPTIONS: "-csearch_path=public" }],
    ["ambient service", { PGSERVICE: "production" }],
    ["production runtime", { NODE_ENV: "production" }],
  ])("rejects %s before any create/drop instruction can run", (label, replacement) => {
    void label;
    let mutated = false;
    const environment = { ...valid, ...replacement };
    try {
      if (!recoveryDatabaseIsExplicitlyOwned(environment)) throw new Error("Denied project");
      mutated = true;
    } catch {
      expect(mutated).toBe(false);
    }
    expect(mutated).toBe(false);
  });

  it("rejects replaced Docker container, volume, bind mount and public port", () => {
    expect(() => assertIssue215DockerTarget([docker])).not.toThrow();
    for (const changed of [
      { Id: "a".repeat(64) },
      { Name: "/unrelated" },
      { State: { Status: "exited" } },
      { Mounts: [{ Type: "bind", Destination: "/var/lib/postgresql/data" }] },
      { Mounts: [{ Type: "volume", Name: "foreign", Destination: "/var/lib/postgresql/data" }] },
      { NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58487" }] } } },
    ]) expect(() => assertIssue215DockerTarget([{ ...docker, ...changed }])).toThrow();
  });

  it("rejects impostor PostgreSQL role, version, ownership or recovery mode", () => {
    expect(() => assertIssue215LiveIdentity(live)).not.toThrow();
    for (const changed of [
      { database: "valet" }, { actor: "valet" },
      { session_role: "postgres" }, { database_owner: "postgres" },
      { recovery: true }, { port: 5433 }, { can_create_db: false },
      { can_create_role: false }, { version: 150000 },
    ]) expect(() => assertIssue215LiveIdentity({ ...live, ...changed })).toThrow();
  });
});
