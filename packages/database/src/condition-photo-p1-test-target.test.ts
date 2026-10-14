import { describe, expect, it } from "vitest";

import {
  assertIssue215DockerTarget,
  assertIssue215LiveIdentity,
  requireIssue215TestUrl,
} from "./condition-photo-p1-test-target.js";
import {
  assertIssue215CiDockerTarget,
  assertIssue215CiLiveIdentity,
  requireIssue215CiUrl,
} from "./condition-photo-p1-ci-target.mjs";

const goodUrl = "postgresql://issue215_owner:fake@127.0.0.1:58487/issue215_empty";
const environment = {
  TEST_DATABASE_URL: goodUrl,
  NODE_ENV: "test",
  VAYLET_TEST_PROJECT: "database-postgres-provision",
  VAYLET_TEST_RUN_ID: "owned-test-fixture",
};

const docker = {
  Id: "9e5631c9cbd28ed1885923e2bfdd2ae3442f25bc3fa63f80b57c8327bf4c46cc",
  Name: "/vaylet_issue215_p1_local",
  Config: { Image: "postgres:16-alpine", Env: ["POSTGRES_USER=issue215_owner", "POSTGRES_DB=issue215_empty"] },
  State: { Status: "running" },
  NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58487" }] } },
  Mounts: [{ Type: "volume", Name: "83d0792c7318ace85d94f3824619542a4f8344226b0ff16d091d307e428dc72e", Destination: "/var/lib/postgresql/data" }],
};
const live = {
  database: "issue215_empty", actor: "issue215_owner", session_role: "issue215_owner",
  database_owner: "issue215_owner", port: 5432, recovery: false,
  can_create_db: true, can_create_role: true, version: 160000, accepts_connections: true,
};

describe("Issue 215 task-only PostgreSQL target: fail closed before any mutation", () => {
  it("attests the named GitHub Actions database job's exact container ID and PG17 service identity", () => {
    const ciId = "a".repeat(64);
    const env = {
      ...environment,
      TEST_DATABASE_URL: "postgresql://valet:ci-only@localhost:5432/valet",
      VAYLET_ISSUE215_TEST_TARGET: "ci",
      VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID: ciId,
      GITHUB_ACTIONS: "true", GITHUB_JOB: "postgres", GITHUB_RUN_ID: "123456789",
      RUNNER_OS: "Linux", RUNNER_ENVIRONMENT: "github-hosted",
    };
    const ciDocker = {
      Id: ciId,
      Config: {
        Image: "postgres:17-alpine", Env: ["POSTGRES_USER=valet", "POSTGRES_DB=valet"],
        Labels: { "vaylet.issue215.disposable": "true", "vaylet.issue215.run-id": "123456789" },
      },
      State: { Status: "running" },
      NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5432" }] } },
      Mounts: [{ Type: "volume", Destination: "/var/lib/postgresql/data" }],
    };
    const ciLive = {
      ...live, database: "valet", actor: "valet", session_role: "valet",
      database_owner: "valet", version: 170001,
    };
    expect(requireIssue215CiUrl(env)).toBe(env.TEST_DATABASE_URL);
    expect(() => assertIssue215CiDockerTarget([ciDocker], env)).not.toThrow();
    expect(() => assertIssue215CiLiveIdentity(ciLive)).not.toThrow();
    for (const changed of [
      { GITHUB_JOB: "api" }, { GITHUB_ACTIONS: "false" },
      { VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID: "bad" },
      { TEST_DATABASE_URL: `${env.TEST_DATABASE_URL}?options=-cshared_preload_libraries=hack` },
      { TEST_DATABASE_URL: "postgresql://valet:ci-only@db.example.test:5432/valet" },
    ]) expect(() => requireIssue215CiUrl({ ...env, ...changed })).toThrow();
    expect(() => assertIssue215CiDockerTarget([{ ...ciDocker, Id: "b".repeat(64) }], env)).toThrow();
    expect(() => assertIssue215CiDockerTarget([{ ...ciDocker, Config: { ...ciDocker.Config, Labels: {} } }], env)).toThrow();
    expect(() => assertIssue215CiLiveIdentity({ ...ciLive, database_owner: "foreign" })).toThrow();
  });
  it("accepts only an explicit task URL with owned test harness classification", () => {
    expect(requireIssue215TestUrl(environment)).toBe(goodUrl);
  });

  it.each([
    ["missing TEST_DATABASE_URL", { TEST_DATABASE_URL: undefined }],
    ["wrong hostname", { TEST_DATABASE_URL: goodUrl.replace("127.0.0.1", "db.example.test") }],
    ["non-loopback address", { TEST_DATABASE_URL: goodUrl.replace("127.0.0.1", "10.0.0.11") }],
    ["wrong port", { TEST_DATABASE_URL: goodUrl.replace("58487", "5432") }],
    ["wrong database", { TEST_DATABASE_URL: goodUrl.replace("issue215_empty", "valet") }],
    ["wrong database role", { TEST_DATABASE_URL: goodUrl.replace("issue215_owner", "valet") }],
    ["query override", { TEST_DATABASE_URL: `${goodUrl}?options=-csearch_path%3Dpublic` }],
    ["SSL override", { TEST_DATABASE_URL: `${goodUrl}?sslmode=disable` }],
    ["URL fragment", { TEST_DATABASE_URL: `${goodUrl}#unverified` }],
    ["malformed URL", { TEST_DATABASE_URL: "not a url" }],
    ["unsupported protocol", { TEST_DATABASE_URL: goodUrl.replace("postgresql:", "https:") }],
    ["environment mismatch", { NODE_ENV: "production" }],
    ["missing ownership lease", { VAYLET_TEST_RUN_ID: undefined }],
    ["wrong harness classification", { VAYLET_TEST_PROJECT: "database-non-postgres" }],
    ["pg ambient override", { PGOPTIONS: "-csearch_path=unsafe" }],
    ["pg service override", { PGSERVICE: "other" }],
  ])("rejects %s without calling any database lifecycle function", (_label, override) => {
    const createDatabase = () => { throw new Error("unsafe callback must never run"); };
    expect(() => {
      requireIssue215TestUrl({ ...environment, ...override });
      createDatabase();
    }).toThrow(/Issue 215 test target/);
  });

  it("verifies live PostgreSQL identity, bootstrap role and database ownership", () => {
    expect(() => assertIssue215LiveIdentity(live)).not.toThrow();
    for (const change of [
      { database: "valet" }, { actor: "valet" }, { session_role: "other" },
      { database_owner: "other" }, { port: 7777 }, { recovery: true },
      { can_create_db: false }, { can_create_role: false },
      { version: 150000 }, { version: Number.NaN },
      { accepts_connections: false },
    ]) expect(() => assertIssue215LiveIdentity({ ...live, ...change })).toThrow();
  });

  it("requires the actual named isolated Docker container, bounded loopback port and volume", () => {
    expect(() => assertIssue215DockerTarget([docker])).not.toThrow();
    for (const changed of [
      { Id: "b".repeat(64) },
      { Name: "/valet_shared" },
      { State: { Status: "exited" } },
      { Mounts: [{ Type: "bind", Destination: "/var/lib/postgresql/data" }] },
      { Mounts: [{ Type: "volume", Name: "another_volume", Destination: "/var/lib/postgresql/data" }] },
      { NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58487" }] } } },
    ]) expect(() => assertIssue215DockerTarget([{ ...docker, ...changed }])).toThrow();
    expect(() => assertIssue215DockerTarget([])).toThrow();
  });
});
