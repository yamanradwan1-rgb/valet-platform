import { execFileSync } from "node:child_process";
import { cpus, freemem, platform, release, totalmem } from "node:os";

import type { Pool } from "pg";

export async function capacityEnvironment(pool: Pool) {
  const [database, settings] = await Promise.all([
    pool.query<{ server_version: string }>("SHOW server_version"),
    pool.query<{ max_connections: string }>("SHOW max_connections"),
  ]);
  const cpu = cpus()[0];
  return {
    apiProcessCount: 1,
    apiRuntimeClass: "built Node process, NODE_ENV=development",
    cpuCount: cpus().length,
    cpuModel: cpu?.model ?? "unknown",
    databaseTopologyClass:
      "loopback PostgreSQL service in the same LXC container",
    dbPoolClass: "node-postgres default pool; maximum 10 per API process",
    gitSha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    memoryAvailableBytesAtStart: freemem(),
    memoryTotalBytes: totalmem(),
    nodeVersion: process.version,
    os: `${platform()} ${release()}`,
    postgresMaxConnections: Number(settings.rows[0]?.max_connections ?? 0),
    postgresVersion: database.rows[0]?.server_version ?? "unknown",
    workerProcessCount: 0,
  };
}
