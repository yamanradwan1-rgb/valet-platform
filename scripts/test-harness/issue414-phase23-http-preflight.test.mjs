import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { assertIssue414Phase23HttpTestTarget } from "./invocation-lease.mjs";
import { classifyPackageTests } from "./test-classification.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const runner = resolve(root, "run-owned-tests.mjs");
const projectRunner = resolve(root, "run-postgres-projects.mjs");
const apiDir = resolve(root, "../../apps/api");
const vitestBin = resolve(apiDir, "node_modules/vitest/vitest.mjs");
const chosen = "test/management-alert-phase23-http.integration.test.ts";
const dedicated =
  "postgresql://vaylet_test_admin:fake@127.0.0.1:45432/vaylet_test";

function refuseBeforeLease(
  value,
  extra = {},
  command = [runner, "api", "vitest.config.mjs", chosen],
) {
  const env = {
    ...process.env,
    CI: "false",
    GITHUB_ACTIONS: "false",
    ISSUE414_W7_HTTP_TABS_PROFILE: "",
    MIGRATION_DATABASE_URL:
      "postgresql://sentinel:sentinel@127.0.0.1:5432/valet",
    ...extra,
  };
  if (value === undefined) delete env.TEST_DATABASE_URL;
  else env.TEST_DATABASE_URL = value;
  const result = spawnSync(process.execPath, command, {
    cwd: apiDir,
    env,
    encoding: "utf8",
    // Discovery/reading the full API graph can be slow under parallel CI;
    // failure must still happen before any lease, child DDL or globalSetup.
    timeout: 25_000,
  });
  assert.equal(result.status, 1, result.stderr);
  const output = result.stdout + result.stderr;
  assert.match(output, /Issue414 P23 HTTP/);
  assert.doesNotMatch(
    output,
    /\[postgres-harness\]|\[test-harness\]|CREATE DATABASE/,
  );
}

test("P23 HTTP runner refuses absent URL before fallback, discovery and lease", () => {
  refuseBeforeLease(undefined);
});

test("P23 HTTP runner denies wrong local port and remote target before lease", () => {
  refuseBeforeLease("postgresql://valet:fake@127.0.0.1:5432/valet");
  refuseBeforeLease("postgresql://valet:fake@192.0.2.1:45432/valet");
});

test("P23 HTTP runner refuses malformed URL and production mode", () => {
  refuseBeforeLease("not-a-url");
  refuseBeforeLease(dedicated, { NODE_ENV: "production" });
});

test("project-wide P23 PostgreSQL run rejects missing URL before obtaining a lease", () => {
  refuseBeforeLease(undefined, {}, [
    projectRunner,
    "vitest.config.mjs",
    "api-postgres-race",
  ]);
});

test("project runner wildcard and mixed selectors reject unsafe target before parent lease", () => {
  for (const projects of [
    ["api-postgres-*"],
    ["api-postgres-standard", "api-postgres-race"],
  ]) {
    refuseBeforeLease(undefined, {}, [
      projectRunner,
      "vitest.config.mjs",
      ...projects,
    ]);
  }
});

test("focused runner for another race-owned file still refuses the unsafe default before lease", () => {
  refuseBeforeLease(undefined, {}, [
    runner,
    "api",
    "vitest.config.mjs",
    "test/issue414-financial-alert-source.integration.test.ts",
  ]);
});

test("direct project-wide Vitest rejects default 5432 without a filename", () => {
  refuseBeforeLease(undefined, {}, [
    vitestBin,
    "run",
    "--config",
    "vitest.config.mjs",
    "--project",
    "api-postgres-race",
  ]);
});

test("unfiltered direct Vitest rejects fallback before any project globalSetup", () => {
  refuseBeforeLease(undefined, {}, [
    vitestBin,
    "run",
    "--config",
    "vitest.config.mjs",
  ]);
});

test("wildcard and multi-project Vitest selectors refuse fallback before any globalSetup", () => {
  for (const selectors of [
    ["--project", "api-postgres-*"],
    ["--project=api-postgres-standard", "--project=api-postgres-race"],
  ]) {
    refuseBeforeLease(undefined, {}, [
      vitestBin,
      "run",
      "--config",
      "vitest.config.mjs",
      ...selectors,
    ]);
  }
});

test("P23 refuses forged CI flags and unattested PostgreSQL service", () => {
  refuseBeforeLease("postgresql://valet:fake@localhost:5432/valet", {
    CI: "true",
    GITHUB_ACTIONS: "true",
    VAYLET_ISSUE215_TEST_TARGET: "ci",
    VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID: "f".repeat(64),
    GITHUB_JOB: "not-a-postgres-job",
    RUNNER_OS: "Linux",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_RUN_ID: "123456789",
  });
});

test("P23 HTTP ownership stays on the prelease-fenced API race project", () => {
  const ownership = classifyPackageTests({
    packageKind: "api",
    rootDir: resolve(apiDir, "test"),
  });
  const owningProjects = Object.entries(ownership)
    .filter(([, files]) =>
      files.includes("management-alert-phase23-http.integration.test.ts"),
    )
    .map(([project]) => project);
  assert.deepEqual(owningProjects, ["api-postgres-race"]);
});

test("P23 HTTP target validator accepts only the explicitly dedicated URL without connecting", () => {
  const previous = process.env.TEST_DATABASE_URL;
  const ci = process.env.CI;
  const actions = process.env.GITHUB_ACTIONS;
  const nodeEnv = process.env.NODE_ENV;
  try {
    process.env.TEST_DATABASE_URL = dedicated;
    process.env.CI = "false";
    process.env.GITHUB_ACTIONS = "false";
    process.env.NODE_ENV = "test";
    assert.equal(assertIssue414Phase23HttpTestTarget(), dedicated);
  } finally {
    if (previous === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = previous;
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
    if (actions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = actions;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }
});
