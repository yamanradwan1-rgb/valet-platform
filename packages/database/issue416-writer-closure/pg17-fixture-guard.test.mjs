import assert from "node:assert/strict";
import { test } from "node:test";
import { assertW26Fixture } from "./pg17-fixture-guard.mjs";

const id = "e02e24f1f8db832d18d64f7300ddb8d602c52d39a7968f880b5e9f88f5169e63";
const config = Object.freeze({
  purpose: "PROBE",
  role: "issue416_w26_runtime",
  database: "issue416_w26_db",
  container: "vaylet-issue416-w26-20261114-pg17",
  containerId: id,
  url: "postgresql://issue416_w26_owner:synthetic-only@127.0.0.1:51126/issue416_w26_db",
});
const docker = [
  {
    Id: id,
    Name: "/" + config.container,
    State: { Running: true },
    Config: {
      Image: "postgres:17-alpine",
      Labels: {
        "vaylet.issue": "416",
        "vaylet.owner": "issue416-w26-20261114",
        "vaylet.environment": "isolated-test",
        "vaylet.disposable": "true",
      },
    },
    NetworkSettings: {
      Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "51126" }] },
    },
  },
];

test("dedicated marker is only a preflight fact, not user credential authorization", () => {
  assert.deepEqual(assertW26Fixture(config, docker), {
    database: "issue416_w26_db",
    runtimeRole: "issue416_w26_runtime",
    purpose: "PROBE",
  });
});

test("W9/Prime container, shared DB, and mismatched PG17 ports cannot be used", () => {
  const negatives = [
    [
      { ...config, container: "vaylet-issue416-fresh2-20261114-prime-pg17" },
      docker,
    ],
    [{ ...config, database: "vaylet_test" }, docker],
    [{ ...config, url: config.url.replace(":51126/", ":51017/") }, docker],
    [{ ...config, url: config.url.replace(":51126/", ":5432/") }, docker],
    [config, [{ ...docker[0], Id: "f".repeat(64) }]],
    [
      config,
      [
        {
          ...docker[0],
          Config: {
            ...docker[0].Config,
            Labels: {
              ...docker[0].Config.Labels,
              "vaylet.owner": "issue416-prime-fresh2",
            },
          },
        },
      ],
    ],
    [config, [{ ...docker[0], State: { Running: false } }]],
    [
      config,
      [
        {
          ...docker[0],
          NetworkSettings: {
            Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "51126" }] },
          },
        },
      ],
    ],
  ];
  for (const [candidate, metadata] of negatives) {
    assert.throws(() => assertW26Fixture(candidate, metadata), /W26_PG17_/);
  }
});

test("DB/provisioner writes need separate exact cutover opt-in", () => {
  assert.throws(
    () =>
      assertW26Fixture(
        {
          ...config,
          purpose: "REPEAT_CUTOVER",
        },
        docker,
      ),
    /CUTOVER_OPT_IN_REQUIRED/,
  );
  assert.deepEqual(
    assertW26Fixture(
      {
        ...config,
        purpose: "REPEAT_CUTOVER",
        mutationConsent: "W26_DISPOSABLE_C3_REVOKE_TWICE",
      },
      docker,
    ).purpose,
    "REPEAT_CUTOVER",
  );
  for (const option of ["", "yes", "W26_DISPOSABLE_C3_REVOKE"]) {
    assert.throws(() =>
      assertW26Fixture(
        {
          ...config,
          purpose: "REPEAT_CUTOVER",
          mutationConsent: option,
        },
        docker,
      ),
    );
  }
});

test("inherited test, production or migration URL cannot select the same DB", () => {
  for (const name of [
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "TEST_DATABASE_URL",
  ]) {
    assert.throws(
      () =>
        assertW26Fixture(config, docker, {
          [name]: config.url.replace("synthetic-only", "other-password"),
        }),
      /TARGET_COLLIDES_WITH_EXISTING_DB/,
    );
  }
  assert.throws(
    () =>
      assertW26Fixture(config, docker, {
        MIGRATION_DATABASE_URL: "invalid-url",
      }),
    /INHERITED_TARGET_UNVERIFIABLE/,
  );
});

test("read-only mode requires canonical PG role and no ambiguous endpoint", () => {
  for (const candidate of [
    { role: "postgres;drop schema public" },
    { role: "issue416-W26-runtime" },
    { url: config.url.replace("127.0.0.1", "localhost") },
    { url: config.url.replace("/issue416_w26_db", "/postgres") },
    { url: config.url + "?sslmode=disable" },
  ]) {
    assert.throws(() => assertW26Fixture({ ...config, ...candidate }, docker));
  }
});
