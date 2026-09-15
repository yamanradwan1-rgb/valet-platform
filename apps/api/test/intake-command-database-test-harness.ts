import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";

export function useIntakeCommandDatabase() {
  const adminDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    "postgresql://valet:valet@127.0.0.1:5432/valet";
  const suffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const databaseName = `valet_004e_app_${suffix}`;
  const runtimeRole = `valet_runtime_intake_${suffix}`;
  const runtimePassword = `runtime-${randomUUID()}`;
  const repositoryRoot = resolve(process.cwd(), "../..");
  const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  let adminPool: Pool;
  let databaseCreated = false;
  let runtimePool: Pool;
  let runtimeRoleCreated = false;
  let migrationUrl = "";
  let runtimeUrl = "";

  function scopedUrl(database: string, runtime = false): string {
    const url = new URL(adminDatabaseUrl);
    url.pathname = `/${database}`;
    if (runtime) {
      url.username = runtimeRole;
      url.password = runtimePassword;
    }
    return url.toString();
  }

  function redactDatabaseDetails(value: string): string {
    let redacted = value;
    for (const secret of [
      adminDatabaseUrl,
      migrationUrl,
      runtimeUrl,
      runtimePassword,
    ]) {
      if (secret !== "") redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
    return redacted;
  }

  async function runPnpm(
    args: string[],
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    const npmExecPath = process.env.npm_execpath;
    const command =
      npmExecPath === undefined ? pnpmExecutable : process.execPath;
    const commandArgs =
      npmExecPath === undefined ? args : [npmExecPath, ...args];
    const childEnvironment = { ...process.env };
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete childEnvironment[key];
      else childEnvironment[key] = value;
    }
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, commandArgs, {
        cwd: repositoryRoot,
        env: childEnvironment,
        shell: npmExecPath === undefined && process.platform === "win32",
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolvePromise();
        else {
          reject(
            new Error(
              redactDatabaseDetails(
                `pnpm ${args.join(" ")} failed with exit code ${String(code)}.\n${stdout}\n${stderr}`,
              ),
            ),
          );
        }
      });
    });
  }

  beforeAll(async () => {
    migrationUrl = scopedUrl(databaseName);
    runtimeUrl = scopedUrl(databaseName, true);
    const bootstrapPool = new Pool({ connectionString: adminDatabaseUrl });
    try {
      await bootstrapPool.query(`CREATE DATABASE "${databaseName}"`);
      databaseCreated = true;
    } finally {
      await bootstrapPool.end();
    }
    await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
      DATABASE_URL: undefined,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    });
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    });
    runtimeRoleCreated = true;
    adminPool = new Pool({ connectionString: migrationUrl });
    runtimePool = createRuntimePostgresPool(runtimeUrl);
  }, 120_000);

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    const bootstrapPool = new Pool({ connectionString: adminDatabaseUrl });
    try {
      if (databaseCreated) {
        await bootstrapPool.query(
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        );
      }
      if (runtimeRoleCreated) {
        await bootstrapPool.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
      }
    } finally {
      await bootstrapPool.end();
    }
  }, 60_000);

  return {
    get adminPool() {
      return adminPool;
    },
    get runtimePool() {
      return runtimePool;
    },
  };
}
