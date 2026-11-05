import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { classifyPackageTests } from "../../../scripts/test-harness/test-classification.mjs";
import { assertPostgresBudget, postgresProfileForProject } from "../../../scripts/test-harness/resource-budget.mjs";
import {
  assertIssue429DockerIdentity, assertIssue429PrivateTarget,
  preflightIssue429BeforeLease,
} from "./target-preflight.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const safeBase = {
  NODE_ENV: "test",
  ISSUE429_W2_PG17_LEASE: "ATTESTED_EXCLUSIVE",
  TEST_DATABASE_URL:
    "postgresql://vaylet_test_admin:synthetic-only@127.0.0.1:45432/vaylet_test",
};

test("private OCR fixture has a bounded single-file six-client resource profile", () => {
  const profile = postgresProfileForProject("database-postgres-issue429-ocr");
  assert.equal(profile.name, "database-ocr");
  assert.equal(profile.directClients, 6);
  assert.equal(profile.fileWorkers, 1);
  assert.equal(profile.subprocessMax, 1);
  assert.ok(assertPostgresBudget({ profile, workers: 1, maxConnections: 100,
    reservedConnections: 0, superuserReservedConnections: 3 }).headroom > 0);
});

test("strict target scope validates before any Docker or database probe", async () => {
  const malformed = [
    {},
    { ...safeBase, TEST_DATABASE_URL: undefined },
    { ...safeBase, ISSUE429_W2_PG17_LEASE: undefined },
    { ...safeBase, NODE_ENV: "production" },
    { ...safeBase, NODE_ENV: undefined },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://valet:valet@127.0.0.1:5432/valet" },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://vaylet_test_admin:opaque@127.0.0.1:5432/vaylet_test" },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://vaylet_test_admin:opaque@localhost:45432/vaylet_test" },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://admin:opaque@127.0.0.1:45432/vaylet_test" },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://vaylet_test_admin:opaque@127.0.0.1:45432/production" },
    { ...safeBase, TEST_DATABASE_URL:
      "postgresql://vaylet_test_admin:opaque@127.0.0.1:45432/vaylet_test?sslmode=disable" },
    { ...safeBase, PGPORT: "5432" },
    { ...safeBase, VAYLET_TEST_CLUSTER_RUN_ID: "unverified-lease" },
    { ...safeBase, VAYLET_TEST_RUN_ID: "unverified-run" },
  ];
  for (const env of malformed) {
    let probed = 0;
    await assert.rejects(preflightIssue429BeforeLease(env, {
      verifyDocker: () => { probed += 1; },
      verifyDatabase: () => { probed += 1; },
    }), /Issue429/);
    assert.equal(probed, 0, "must reject before any external probe or lease");
  }
});

test("Docker and live PG17 failures refuse target without lease", async () => {
  assert.equal(assertIssue429PrivateTarget(safeBase), safeBase.TEST_DATABASE_URL);
  const events = [];
  await assert.rejects(preflightIssue429BeforeLease(safeBase, {
    verifyDocker: () => { events.push("docker"); throw Error("not running"); },
    verifyDatabase: () => { events.push("database"); },
  }), /attestation failed/);
  assert.deepEqual(events, ["docker"]);
  await assert.rejects(preflightIssue429BeforeLease(safeBase, {
    verifyDocker: () => { events.push("docker"); },
    verifyDatabase: () => { events.push("database"); throw Error("wrong PG17"); },
  }), /attestation failed/);
  assert.deepEqual(events, ["docker", "docker", "database"]);
});

test("Docker identity insists on both isolated-test and Compose project labels", () => {
  const target = {
    Name: "/vaylet-test-postgres",
    Config: {
      Image: "postgres:17",
      Env: ["POSTGRES_USER=vaylet_test_admin", "POSTGRES_DB=vaylet_test"],
      Labels: {
        "vaylet.environment": "isolated-test",
        "com.docker.compose.project": "vaylet-test",
        "com.docker.compose.service": "postgres",
      },
    },
    State: { Status: "running" },
    NetworkSettings: {
      Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "45432" }] },
    },
    Mounts: [{
      Type: "volume", Name: "vaylet-test_postgres_data",
      Destination: "/var/lib/postgresql/data", RW: true,
    }],
  };
  assert.doesNotThrow(() => assertIssue429DockerIdentity([target]));
  for (const [label, wrong] of [
    ["vaylet.environment", "development"],
    ["com.docker.compose.project", "production"],
    ["com.docker.compose.service", "dashboard"],
  ]) {
    const changed = structuredClone(target);
    changed.Config.Labels[label] = wrong;
    assert.throws(() => assertIssue429DockerIdentity([changed]), /identity mismatch/);
    delete changed.Config.Labels[label];
    assert.throws(() => assertIssue429DockerIdentity([changed]), /identity mismatch/);
  }
  for (const mount of [
    { ...target.Mounts[0], Type: "bind" },
    { ...target.Mounts[0], Name: "valet_postgres_data" },
    { ...target.Mounts[0], Destination: "/var/lib/postgresql/other" },
    { ...target.Mounts[0], RW: false },
  ]) {
    assert.throws(() => assertIssue429DockerIdentity([
      { ...target, Mounts: [mount] },
    ]), /identity mismatch/);
  }
  assert.throws(() => assertIssue429DockerIdentity([
    { ...target, Mounts: [target.Mounts[0],target.Mounts[0]] },
  ]), /identity mismatch/);
});

test("ordinary package classifier cannot discover any private Issue429 PG suite", () => {
  const grouped = classifyPackageTests({
    packageKind: "database", rootDir: sourceRoot,
  });
  const files = Object.values(grouped).flat();
  assert.equal(files.some((file) =>
    file.includes("issue429-ocr-admission.integration.test.ts") ||
    file.includes("issue429-private/ocr-admission.integration.test.ts")
  ), false);
});

test("outer generic project runner refuses private config before lease", () => {
  const command = spawnSync(process.execPath, [
    "../../scripts/test-harness/run-postgres-projects.mjs",
    "vitest.issue429-ocr.config.mjs", "database-postgres-issue429-ocr",
  ], {
    cwd: packageRoot,
    env: { ...process.env, ...safeBase },
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /dedicated prelease-gated Vitest config directly/);
  assert.doesNotMatch(command.stderr, /PostgreSQL test cluster.*owned/);
});

test("focused general runner refuses private config before generic lease", () => {
  const command = spawnSync(process.execPath, [
    "../../scripts/test-harness/run-owned-tests.mjs",
    "database", "vitest.issue429-ocr.config.mjs",
    "src/postgres.test.ts",
  ], {
    cwd: packageRoot,
    env: { ...process.env, ...safeBase },
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /dedicated prelease-gated Vitest config directly/);
  assert.doesNotMatch(command.stderr, /PostgreSQL test cluster.*owned/);
});

test("direct private Vitest config rejects untrusted target before globalSetup", () => {
  const command = spawnSync(process.execPath, [
    "--input-type=module", "-e",
    "const {default: config}=await import('./vitest.issue429-ocr.config.mjs'); await config({});",
  ], {
    cwd: packageRoot,
    env: {
      ...process.env,
      ...safeBase,
      TEST_DATABASE_URL: "postgresql://valet:valet@127.0.0.1:5432/valet",
    },
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /Issue429 private OCR refuses nonisolated/);
  assert.doesNotMatch(command.stderr, /PostgreSQL test cluster/);
});
