import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { Pool } from "pg";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { ShiftTestContext } from "./shift-test-context";
import { dropShiftFixtureDatabase } from "./shift-test-database-cleanup";

async function runDatabaseCommand(
  args: readonly string[],
  environment: Record<string, string>,
): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const command =
    npmExecPath === undefined
      ? process.platform === "win32"
        ? "pnpm.cmd"
        : "pnpm"
      : process.execPath;
  const commandArgs =
    npmExecPath === undefined ? [...args] : [npmExecPath, ...args];
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: resolve(process.cwd(), "../.."),
      env: { ...process.env, ...environment },
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    // Database CLI diagnostics can contain connection URLs and secrets.
    // Return only a bounded exit status, never raw child stdout/stderr.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", () =>
      reject(new Error("T3 database setup child could not be started.")),
    );
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `T3 database setup command failed (exit ${code ?? "unknown"}).`,
          ),
        );
    });
  });
}

export async function setupGuestT3Database(
  context: ShiftTestContext,
  migratorUrl: string,
  disposableEnvironment: Readonly<Record<string, string>>,
): Promise<void> {
  const bootstrap = new Pool({ connectionString: migratorUrl });
  try {
    await bootstrap.query(`CREATE DATABASE "${context.databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  const environment = {
    ...disposableEnvironment,
    NODE_ENV: "test",
    MIGRATION_DATABASE_URL: context.migrationUrl,
    DATABASE_URL: context.runtimeUrl,
  };
  await runDatabaseCommand(
    ["--filter", "@valet/database", "migrate:deploy"],
    environment,
  );
  // In PostgreSQL CI, the real child hook owns S04 key provisioning under
  // the shared CI management-writer advisory lock. A missing hook must fail
  // the provisioning contract rather than be hidden by a test-side fallback.
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_JOB !== "postgres"
  ) {
    await runDatabaseCommand(
      [
        "--filter",
        "@valet/database",
        "exec",
        "node",
        "scripts/provision-s04-proof-key.mjs",
      ],
      environment,
    );
  }
  await runDatabaseCommand(
    ["--filter", "@valet/database", "runtime:provision"],
    environment,
  );
  context.runtimePool = createRuntimePostgresPool(context.runtimeUrl);
}

export async function teardownGuestT3Database(
  context: ShiftTestContext,
  migratorUrl: string,
): Promise<void> {
  await context.runtimePool?.end();
  await context.adminPool.end();
  const bootstrap = new Pool({ connectionString: migratorUrl });
  try {
    await dropShiftFixtureDatabase(bootstrap, context.databaseName);
    await bootstrap.query(`DROP ROLE IF EXISTS "${context.runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}
