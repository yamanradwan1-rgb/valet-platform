import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { project, runtimeFile } from "./docker-tools.mjs";

const config = JSON.parse(readFileSync(runtimeFile, "utf8"));
if (config.containerProject !== project ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(config.endpoint) ||
    config.versioning !== true ||
    !config.accessKeyId || !config.secretAccessKey)
  throw new Error("Real S3 test setup is missing or unsafe.");

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = [
  "--filter", "@valet/api", "exec", "vitest", "run",
  "--config", "vitest.config.mjs", "--project", "api-non-postgres",
  "test/issue215-real-s3.test.ts",
  "test/issue215-real-s3-unknown.test.ts",
];
const launch = process.platform === "win32"
  ? { executable: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `pnpm ${args.join(" ")}`] }
  : { executable: "pnpm", args };
const result = spawnSync(launch.executable, launch.args, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ISSUE215_REAL_S3_ENABLED: "true",
    ISSUE215_S3_ENDPOINT: config.endpoint,
    ISSUE215_S3_BUCKET: config.bucket,
    ISSUE215_S3_ACCESS_KEY_ID: config.accessKeyId,
    ISSUE215_S3_SECRET_ACCESS_KEY: config.secretAccessKey,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
