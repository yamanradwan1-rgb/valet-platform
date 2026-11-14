import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCEPTANCE_TARGET, assertAcceptanceEnvironment, assertAcceptanceIdentity,
} from "./pg17-acceptance-target.mjs";
import { assertDockerFixture } from "./pg17-acceptance-runtime.mjs";

const secret = "w38-example-fixture-pass";
const cleanEnv = () => ({ ISSUE416_W38_ACCEPTANCE_PG_PASSWORD: secret });
const validIdentity = () => ({
  database: ACCEPTANCE_TARGET.database,
  database_owner: ACCEPTANCE_TARGET.owner,
  actor: ACCEPTANCE_TARGET.login, session_role: ACCEPTANCE_TARGET.login,
  marker: ACCEPTANCE_TARGET.marker,
  server_port: 5432, server_version: 170006,
  recovery: false, is_superuser: false, can_create_db: false,
  can_create_role: false, bypass_rls: false, can_replicate: false,
  owner_member: false, can_create_schema: false,
  transaction_isolation: "read committed", transaction_read_only: "on",
  backend_pid: 1902, server_started: "2026-11-14 18:01:00+00",
});

test("only exact synthetic local fixture login and no inherited DB target", () => {
  assert.equal(assertAcceptanceEnvironment(cleanEnv()).port, 51138);
  for (const env of [
    {}, { ...cleanEnv(), NODE_ENV: "production" },
    { ...cleanEnv(), CI: "true" },
    { ...cleanEnv(), GITHUB_ACTIONS: "true" },
    { ...cleanEnv(), DATABASE_URL: "postgresql://unsafe" },
    { ...cleanEnv(), PGHOST: "127.0.0.1" },
    { ...cleanEnv(), VAYLET_TEST_TARGET: "test" },
    { ...cleanEnv(), ISSUE416_W38_ACCEPTANCE_PG_PASSWORD: "wrong" },
    { ...cleanEnv(), ISSUE416_W38_ACCEPTANCE_PG_PASSWORD: "" },
  ]) {
    assert.throws(() => assertAcceptanceEnvironment(env), /W30_PG17_/);
  }
});

test("exact runtime identity refuses database, role, version and grants drift", () => {
  const original = validIdentity();
  assert.equal(assertAcceptanceIdentity(original).backendPid, 1902);
  for (const [field, invalid] of [
    ["database", "issue416_other_db"], ["database_owner", "postgres"],
    ["actor", "issue416_w38_runtime"], ["session_role", "postgres"],
    ["marker", "fake"], ["server_port", 51138],
    ["server_version", 160009], ["server_version", 180000],
    ["recovery", true], ["is_superuser", true],
    ["can_create_db", true], ["can_create_role", true],
    ["bypass_rls", true], ["can_replicate", true],
    ["owner_member", true], ["can_create_schema", true],
    ["transaction_isolation", "repeatable read"],
    ["transaction_read_only", "off"], ["backend_pid", 0],
    ["server_started", ""],
  ]) {
    assert.throws(
      () => assertAcceptanceIdentity({ ...original, [field]: invalid }),
      /W30_PG17_FIXTURE_IDENTITY_FAILED/,
      field,
    );
  }
});

test("Docker ID, name, image, active state and mapped port are pinned", () => {
  const t = ACCEPTANCE_TARGET;
  const identity = `${t.containerId}|/${t.container}|running|postgres:17-alpine|issue416-worker-38|isolated-test|true|416`;
  const port = `${t.host}:${t.port}`;
  assert.equal(assertDockerFixture(identity, port), true);
  for (const [a, b] of [
    [identity.replace(t.containerId, "other"), port],
    [identity.replace("running", "exited"), port],
    [identity.replace("postgres:17-alpine", "postgres:16"), port],
    [identity.replace("issue416-worker-38", "issue416-prime-fresh2"), port],
    [identity.replace("|416", "|417"), port],
    [identity, "127.0.0.1:51016"],
    [identity, "0.0.0.0:51138"],
  ]) {
    assert.throws(() => assertDockerFixture(a, b), /ATTESTATION_FAILED/);
  }
});
