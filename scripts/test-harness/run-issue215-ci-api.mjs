import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { project, bucket, runtimeFile } from "../issue215-local-s3/docker-tools.mjs";

// The attested, task-owned fixture is created by start.mjs in this CI job.
// Keep its disposable credentials out of the workflow log and GITHUB_ENV.
if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_JOB !== "postgres" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    process.env.VAYLET_ISSUE215_TEST_TARGET !== "ci" ||
    !/^[a-f0-9]{64}$/.test(process.env.VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID ?? "")) {
  throw new Error("Issue 215 CI PostgreSQL target identity is missing.");
}

const fixture = JSON.parse(readFileSync(runtimeFile, "utf8"));
if (fixture.temporary !== true || fixture.versioning !== true ||
    fixture.containerProject !== project || fixture.bucket !== bucket ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture.endpoint ?? "") ||
    !/^issue215app[a-f0-9]{10}$/.test(fixture.accessKeyId ?? "") ||
    !/^[a-f0-9]{56}$/.test(fixture.secretAccessKey ?? "") ||
    !/^[a-f0-9]{64}$/.test(fixture.containerId ?? "") ||
    !/^[a-f0-9]{32}$/.test(fixture.runId ?? "")) {
  throw new Error("Issue 215 disposable S3 fixture attestation is missing.");
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const result = spawnSync("pnpm", [
  "--filter", "@valet/api", "run", "test:postgres:issue215",
], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    ISSUE215_REAL_HTTP_ENABLED: "true",
    ISSUE215_REAL_S3_ENABLED: "true",
    ISSUE215_S3_ENDPOINT: fixture.endpoint,
    ISSUE215_S3_BUCKET: fixture.bucket,
    ISSUE215_S3_ACCESS_KEY_ID: fixture.accessKeyId,
    ISSUE215_S3_SECRET_ACCESS_KEY: fixture.secretAccessKey,
  },
});
if (result.error) throw new Error(`Issue 215 protected runner failed: ${result.error.message}`);
process.exitCode = result.status ?? 1;
