import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { OptionCAfterFixture } from "./after-fixture";

const repositoryRoot = resolve(process.cwd(), "../..");

export async function runLegacyRuntimeProvisioner(
  fixture: OptionCAfterFixture,
) {
  const npmExecPath = process.env.npm_execpath;
  const command =
    npmExecPath === undefined
      ? process.platform === "win32"
        ? "pnpm.cmd"
        : "pnpm"
      : process.execPath;
  const args =
    npmExecPath === undefined
      ? ["--filter", "@valet/database", "runtime:provision"]
      : [npmExecPath, "--filter", "@valet/database", "runtime:provision"];
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolvePromise, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(command, args, {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          MIGRATION_DATABASE_URL: fixture.migrationDatabaseUrl(),
          DATABASE_URL: fixture.runtimeDatabaseUrl(),
        },
        shell: npmExecPath === undefined && process.platform === "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolvePromise({ code, stderr, stdout });
      });
    },
  );
}
