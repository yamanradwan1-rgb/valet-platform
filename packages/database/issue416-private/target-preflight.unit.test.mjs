import { describe, expect, it } from "vitest";

import { resolveAttestedScript } from "./attested-node-child.mjs";
import { assertMigrationMode, resolvePrismaMigrateInvocation } from "./prisma-migrations.mjs";
import { assertDockerIdentity } from "./docker-target.mjs";
import { assertSqlIdentity } from "./postgres-target.mjs";
import { assertTargetEnvironment, sanitizedChildEnvironment, TARGET } from "./target-contract.mjs";

function fixtureEnv() {
  return Object.fromEntries(Object.entries(TARGET.roles).map(([key, [role, pass]]) =>
    [key, `postgresql://${role}:${pass}@127.0.0.1:${TARGET.port}/${TARGET.database}`]));
}

function fixtureDocker() {
  return [{
    Id: "a".repeat(64), Name: `/${TARGET.container}`,
    Image: "sha256:" + "b".repeat(64),
    Config: {
      Image: TARGET.image,
      Labels: {
        "com.docker.compose.project": TARGET.project,
        "com.docker.compose.service": "postgres",
        "vaylet.environment": "isolated-test",
        "vaylet.issue": "416", "vaylet.owner": "worker-9",
        "vaylet.disposable": "true",
      },
      Env: [`POSTGRES_USER=${TARGET.owner}`, `POSTGRES_DB=${TARGET.database}`],
    },
    State: { Running: true, Status: "running" },
    HostConfig: { PortBindings: {
      "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: TARGET.port }],
    } },
    NetworkSettings: {
      Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: TARGET.port }] },
      Networks: { [`${TARGET.project}_default`]: {} },
    },
    Mounts: [
      { Type: "volume", Name: TARGET.volume, Destination: "/var/lib/postgresql/data" },
      { Type: "bind", RW: false,
        Source: "D:/kndoom/valet-platform/tmp/issue416-impl-w9/packages/database/issue416-private/init-roles.sql",
        Destination: "/docker-entrypoint-initdb.d/01-issue416-w9-roles.sql" },
    ],
  }];
}

function fixtureSql() {
  return {
    database: TARGET.database, database_owner: TARGET.owner,
    actor: TARGET.roles.DATABASE_URL[0],
    session_role: TARGET.roles.DATABASE_URL[0],
    server_port: 5432, server_version: 170007,
    server_started: "2026-11-13 00:00:00+00",
    recovery: false, accepts_connections: true,
    is_superuser: false, can_create_db: false,
    can_create_role: false, can_bypass_rls: false,
    can_replicate: false, inherits_owner: false,
  };
}

describe("Issue416 private target contract", () => {
  it("requires all three explicit distinct synthetic role URLs", () => {
    expect(Object.keys(assertTargetEnvironment(fixtureEnv()))).toHaveLength(3);
    for (const key of Object.keys(TARGET.roles)) {
      const e = fixtureEnv();
      delete e[key];
      expect(() => assertTargetEnvironment(e)).toThrow(key);
    }
  });

  it.each([
    ["default 5432", "postgresql://issue416_w9_runtime:fixture_w9_runtime_only@127.0.0.1:5432/issue416_w9_db"],
    ["QA port 45432", "postgresql://issue416_w9_runtime:fixture_w9_runtime_only@127.0.0.1:45432/issue416_w9_db"],
    ["foreign host", "postgresql://issue416_w9_runtime:fixture_w9_runtime_only@db.internal:55416/issue416_w9_db"],
    ["foreign database", "postgresql://issue416_w9_runtime:fixture_w9_runtime_only@127.0.0.1:55416/production"],
    ["wrong role", "postgresql://issue416_w9_test:fixture_w9_test_only@127.0.0.1:55416/issue416_w9_db"],
    ["query override", "postgresql://issue416_w9_runtime:fixture_w9_runtime_only@127.0.0.1:55416/issue416_w9_db?host=evil"],
  ])("rejects %s before connecting", (_label, value) => {
    expect(() => assertTargetEnvironment({ ...fixtureEnv(), DATABASE_URL: value }))
      .toThrow("unexpected target");
  });

  it.each([
    ["PGHOST", "another-host"], ["PGPASSWORD", "inherited"],
    ["PGSERVICEFILE", "service.conf"], ["VAYLET_TEST_RUN_ID", "old"],
    ["VAYLET_TEST_CLUSTER_RUN_ID", "old"], ["CI", "true"],
    ["NODE_ENV", "production"],
  ])("refuses inherited environment %s", (key, value) => {
    expect(() => assertTargetEnvironment({ ...fixtureEnv(), [key]: value })).toThrow();
  });

  it("sanitizes child environment without .env, PG*, run IDs or auth tokens", () => {
    const cleaned = sanitizedChildEnvironment({
      ...fixtureEnv(), PATH: "test-path", OAUTH_TOKEN: "never-forward",
    });
    expect(cleaned).toMatchObject({ PATH: "test-path", NODE_ENV: "test" });
    expect(cleaned.OAUTH_TOKEN).toBeUndefined();
    expect(cleaned.PGHOST).toBeUndefined();
    expect(cleaned.DATABASE_URL).toBe(fixtureEnv().DATABASE_URL);
  });
});

describe("Issue416 Docker identity", () => {
  it("accepts a fixture with exact owned container labels and mounts", () => {
    expect(assertDockerIdentity(fixtureDocker()).volume).toBe(TARGET.volume);
  });

  it.each([
    ["image", (x) => { x.Config.Image = "postgres:16"; }],
    ["name", (x) => { x.Name = "/other-container"; }],
    ["label", (x) => { x.Config.Labels["vaylet.owner"] = "other"; }],
    ["port", (x) => { x.HostConfig.PortBindings["5432/tcp"][0].HostPort = "45432"; }],
    ["public bind", (x) => { x.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0"; }],
    ["volume", (x) => { x.Mounts[0].Name = "qa-data"; }],
    ["writable init bind", (x) => { x.Mounts[1].RW = true; }],
    ["wrong init source", (x) => { x.Mounts[1].Source = "D:/qa/init-roles.sql"; }],
    ["network", (x) => { x.NetworkSettings.Networks = { qa_default: {} }; }],
    ["stopped", (x) => { x.State.Running = false; }],
  ])("rejects Docker %s mismatch", (_label, change) => {
    const data = fixtureDocker();
    change(data[0]);
    expect(() => assertDockerIdentity(data)).toThrow("Docker attestation refused");
  });
});

describe("Issue416 SQL identity", () => {
  it("accepts the restricted role and exact PG17 fixture", () => {
    expect(assertSqlIdentity(fixtureSql(), TARGET.roles.DATABASE_URL[0]))
      .toBe(fixtureSql().server_started);
  });

  it("permits CREATEROLE only to the exact synthetic migration principal", () => {
    const migration = {
      ...fixtureSql(),
      actor: TARGET.trustedMigrationRole,
      session_role: TARGET.trustedMigrationRole,
      can_create_role: true,
    };
    expect(assertSqlIdentity(migration, TARGET.trustedMigrationRole))
      .toBe(migration.server_started);
    expect(() => assertSqlIdentity({ ...migration, can_create_role: false },
      TARGET.trustedMigrationRole)).toThrow("SQL attestation refused");
    expect(() => assertSqlIdentity({ ...fixtureSql(), can_create_role: true },
      TARGET.roles.DATABASE_URL[0])).toThrow("SQL attestation refused");
    expect(() => assertSqlIdentity({ ...migration, actor: TARGET.roles.TEST_DATABASE_URL[0] },
      TARGET.trustedMigrationRole)).toThrow("SQL attestation refused");
  });

  it.each([
    ["database", "database", "shared_qa"],
    ["owner", "database_owner", "other_owner"],
    ["actor", "actor", TARGET.owner],
    ["session role", "session_role", TARGET.owner],
    ["PG16", "server_version", 160013],
    ["PG18", "server_version", 180000],
    ["superuser", "is_superuser", true],
    ["can create role", "can_create_role", true],
    ["owner membership", "inherits_owner", true],
    ["hot standby", "recovery", true],
    ["wrong port", "server_port", 55416],
  ])("rejects SQL %s mismatch", (_label, key, replacement) => {
    const identity = { ...fixtureSql(), [key]: replacement };
    expect(() => assertSqlIdentity(identity, TARGET.roles.DATABASE_URL[0]))
      .toThrow("SQL attestation refused");
  });
});

describe("Issue416 DDL child path fence", () => {
  it("accepts a package-owned script for the future attested Node runner", () => {
    expect(resolveAttestedScript("scripts/run-migrate-deploy.mjs"))
      .toMatch(/packages[\\/]database[\\/]scripts[\\/]run-migrate-deploy\.mjs$/);
  });

  it.each(["-e", "--require", "../../scripts/test-harness/owned-cleanup.mjs",
    "C:/outside/file.mjs", "../api/src/entry.mjs", "package.json"])(
    "rejects script outside the safe child directory: %s", (path) => {
      expect(() => resolveAttestedScript(path)).toThrow();
    },
  );
});

describe("Issue416 dedicated Prisma migration runner", () => {
  it("resolves only the pinned repository Prisma CLI", () => {
    const invocation = resolvePrismaMigrateInvocation();
    expect(invocation.cli).toMatch(/prisma[\\/]build[\\/]index\.js$/);
    expect(invocation.argv).toEqual(["migrate", "deploy"]);
  });

  it("requires an explicit apply command; rejects all other DDL modes", () => {
    expect(() => assertMigrationMode("--apply")).not.toThrow();
    for (const candidate of [undefined, "migrate", "--reset", "--help", "--schema=other"]) {
      expect(() => assertMigrationMode(candidate)).toThrow("explicit --apply");
    }
  });
});
