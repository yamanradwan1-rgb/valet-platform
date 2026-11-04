import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const runner = resolve(root, "run-owned-tests.mjs");
const apiDir = resolve(root, "../../apps/api");
const command = [
  runner,
  "api",
  "vitest.config.mjs",
  "test/issue414-http-foreground-load.integration.test.ts",
];
const sentinel =
  "postgresql://sentinel:sentinel@127.0.0.1:65432/not_a_test_cluster";

function mustRejectBeforeLease(testDatabaseUrl, additional = {}) {
  const env = {
    ...process.env,
    ISSUE414_W7_HTTP_TABS_PROFILE: "I_OWN_EXCLUSIVE_LOCAL_PG17",
    MIGRATION_DATABASE_URL: sentinel,
    ...additional,
  };
  if (testDatabaseUrl === undefined) delete env.TEST_DATABASE_URL;
  else env.TEST_DATABASE_URL = testDatabaseUrl;
  const child = spawnSync(process.execPath, command, {
    cwd: apiDir,
    env,
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(child.status, 1, child.stderr);
  const output = child.stdout + child.stderr;
  assert.match(
    output,
    /W7 HTTP profile (?:.*TEST_DATABASE_URL|requires an explicit loopback|requires PostgreSQL URL)/,
  );
  assert.doesNotMatch(output, /\[postgres-harness\]|\[test-harness\]/);
}

test("W7 refuses missing explicit URL before generic lease fallback", () => {
  mustRejectBeforeLease(undefined);
});

test("W7 refuses remote target before acquiring a lease", () => {
  mustRejectBeforeLease("postgresql://sentinel:sentinel@192.0.2.1:65432/fake");
});

test("W7 refuses unsafe scheme and database port before acquiring a lease", () => {
  mustRejectBeforeLease("https://sentinel:sentinel@127.0.0.1:65432/fake");
  mustRejectBeforeLease("postgresql://sentinel:sentinel@127.0.0.1:543/fake");
});

test("W7 refuses test profile under production NODE_ENV", () => {
  mustRejectBeforeLease(sentinel, { NODE_ENV: "production" });
});
