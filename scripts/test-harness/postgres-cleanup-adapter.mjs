import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { isProcessAlive } from "./ownership-state.mjs";
import { linuxProcessIdentity } from "./process-identity.mjs";

const execFileAsync = promisify(execFile);

export function createPostgresCleanupAdapter({ adminDatabaseUrl, pg }) {
  return {
    async dropDatabase(name) {
      await withAdminClient(pg, adminDatabaseUrl, (client) =>
        client.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
        ),
      );
    },
    async dropRole(name) {
      await withAdminClient(pg, adminDatabaseUrl, (client) =>
        client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(name)}`),
      );
    },
    async findExistingDatabases(names) {
      if (names.length === 0) return [];
      return withAdminClient(pg, adminDatabaseUrl, async (client) => {
        const result = await client.query(
          "SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) ORDER BY datname",
          [names],
        );
        return result.rows.map((row) => row.datname);
      });
    },
    async findExistingRoles(names) {
      if (names.length === 0) return [];
      return withAdminClient(pg, adminDatabaseUrl, async (client) => {
        const result = await client.query(
          "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname",
          [names],
        );
        return result.rows.map((row) => row.rolname);
      });
    },
    async killProcess(pid, recordedAt, expectedIdentity) {
      if (!isProcessAlive(pid)) return true;
      if (process.platform === "linux") {
        const currentIdentity = linuxProcessIdentity(pid);
        if (expectedIdentity === undefined || currentIdentity === undefined) {
          throw new Error(
            `Cannot prove ownership of live test child process ${pid}.`,
          );
        }
        if (currentIdentity !== expectedIdentity) return false;
      } else if (process.platform !== "win32") {
        throw new Error(
          `Cannot prove ownership of live test child process ${pid} on ${process.platform}.`,
        );
      }
      const startedAt = await processStartTime(pid);
      if (
        process.platform === "win32" &&
        Number.isFinite(recordedAt) &&
        startedAt !== null &&
        startedAt > recordedAt
      ) {
        return false;
      }
      if (process.platform === "win32" && startedAt === null) {
        throw new Error(
          `Cannot prove ownership of live test child process ${pid}.`,
        );
      }
      if (process.platform === "win32") {
        try {
          await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
            windowsHide: true,
          });
        } catch (error) {
          if (isProcessAlive(pid)) throw error;
        }
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
      await waitForProcessExit(pid, startedAt, expectedIdentity, 2_000);
      return true;
    },
  };
}

export async function readClusterBudgetSettings({ adminDatabaseUrl, pg }) {
  return withAdminClient(pg, adminDatabaseUrl, async (client) => {
    const result = await client.query(
      `SELECT current_setting('max_connections')::integer AS max_connections,
              current_setting('superuser_reserved_connections')::integer
                AS superuser_reserved_connections,
              COALESCE(NULLIF(current_setting('reserved_connections', true), ''), '0')::integer
                AS reserved_connections`,
    );
    const row = result.rows[0];
    if (row === undefined)
      throw new Error("PostgreSQL cluster budget settings are unavailable.");
    return {
      maxConnections: Number(row.max_connections),
      reservedConnections: Number(row.reserved_connections),
      superuserReservedConnections: Number(row.superuser_reserved_connections),
    };
  });
}

async function withAdminClient(pg, databaseUrl, action) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function waitForProcessExit(
  pid,
  startedAt,
  expectedIdentity,
  deadlineMs,
) {
  const deadline = Date.now() + deadlineMs;
  while (await sameProcessIsAlive(pid, startedAt, expectedIdentity)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Owned test child process ${pid} survived cleanup deadline.`,
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

async function sameProcessIsAlive(pid, startedAt, expectedIdentity) {
  if (!isProcessAlive(pid)) return false;
  if (process.platform === "linux") {
    return linuxProcessIdentity(pid) === expectedIdentity;
  }
  const currentStart = await processStartTime(pid);
  return currentStart !== null && currentStart === startedAt;
}

async function processStartTime(pid) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
        ],
        { windowsHide: true },
      );
      const value = Date.parse(stdout.trim());
      return Number.isFinite(value) ? value : null;
    }
    const { stdout } = await execFileAsync("ps", [
      "-o",
      "lstart=",
      "-p",
      String(pid),
    ]);
    const value = Date.parse(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
