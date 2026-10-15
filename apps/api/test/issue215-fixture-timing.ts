import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Pool } from "pg";

/**
 * Timestamp old issue #215 fixture setup without changing safety assertions
 * or broadening inherited test-hook limits. No URL/secret is printed.
 */
export async function timedIssue215FixtureStage<T>(
  stage: "create-db" | "migrate" | "provision" | "runtime-pools",
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  process.stdout.write(`[issue215-fixture] stage=${stage} started\n`);
  try {
    const result = await action();
    process.stdout.write(
      `[issue215-fixture] stage=${stage} passed ms=${Math.round(performance.now() - startedAt)}\n`,
    );
    return result;
  } catch (error) {
    process.stderr.write(
      `[issue215-fixture] stage=${stage} failed ms=${Math.round(performance.now() - startedAt)}\n`,
    );
    throw error;
  }
}

export async function runIssue215FixturePnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
  redactions: readonly (string | undefined)[],
): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const executable = npmExecPath === undefined
    ? (process.platform === "win32" ? "pnpm.cmd" : "pnpm")
    : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  const childEnvironment = { ...process.env };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[name];
    else childEnvironment[name] = value;
  }
  const startedAt = performance.now();
  let output = "";
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd: resolve(process.cwd(), "../.."),
      env: childEnvironment,
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    const collect = (chunk: Buffer | string) => {
      output = (output + chunk.toString()).slice(-64_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolvePromise();
      else {
        let redacted = output;
        for (const secret of redactions) {
          if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
        }
        reject(new Error(
          `Fixture command ${args.join(" ")} exited ${String(exitCode)}.\n${redacted}`,
        ));
      }
    });
  });
  process.stdout.write(
    `[issue215-fixture] child=${args.at(-1)} completed ms=${Math.round(performance.now() - startedAt)}\n`,
  );
}

/** Real Prisma _prisma_migrations timestamps: never emit credentials or SQL data. */
export async function reportIssue215MigrationTimings(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{ migration_name: string; ms: number }>(
      `SELECT migration_name,
              round(extract(epoch from (finished_at - started_at)) * 1000)::int AS ms
       FROM _prisma_migrations
       WHERE finished_at IS NOT NULL
       ORDER BY ms DESC, migration_name`,
    );
    const durations = result.rows.map((row) => row.ms);
    const slow = result.rows.slice(0, 5).map((row) =>
      `${row.migration_name}:${row.ms}`,
    );
    process.stdout.write(
      `[issue215-fixture] migration-count=${durations.length} sql-ms=${durations.reduce((a,b) => a+b, 0)} slowest=${slow.join(",")}\n`,
    );
  } finally {
    await pool.end();
  }
}
