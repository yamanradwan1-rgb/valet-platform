import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const worker9RuntimePath = resolve(
  import.meta.dirname, "../../tmp/issue215-worker9-final/pg.runtime.json",
);
const denied = "Issue 215 worker9 PostgreSQL target attestation failed.";
const image = "postgres:17-alpine";
const imageId = "sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";
const owner = "issue215-worker9-final";
const execDocker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe",
}).trim();

function runtime() {
  try {
    return JSON.parse(readFileSync(worker9RuntimePath, "utf8"));
  } catch {
    throw new Error(denied);
  }
}

export function requireWorker9DatabaseUrl(env) {
  const data = runtime();
  let url;
  try { url = new URL(data.databaseUrl); }
  catch { throw new Error(denied); }
  if (env.NODE_ENV !== "test" || env.VAYLET_ISSUE215_TEST_TARGET !== "worker9" ||
      !["api-postgres-issue215", "database-postgres-issue215",
        "api-postgres-issue309-browser"]
        .includes(env.VAYLET_TEST_PROJECT) ||
      !env.VAYLET_TEST_RUN_ID ||
      env.VAYLET_ISSUE215_WORKER9_RUN_ID !== data.runId ||
      env.TEST_DATABASE_URL !== data.databaseUrl ||
      !/^[a-f0-9]{32}$/.test(data.runId) ||
      !/^[a-f0-9]{64}$/.test(data.containerId) ||
      !data.containerName?.startsWith("issue215-worker9-pg-") ||
      url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.username !== "issue215_owner" ||
      url.pathname !== "/issue215_empty" || !url.port || !url.password ||
      url.search || url.hash ||
      ["PGHOST","PGPORT","PGUSER","PGDATABASE","PGOPTIONS","PGSERVICE",
        "PGSSLMODE","PGSERVICEFILE"].some((key) => env[key]))
    throw new Error(denied);
  return data;
}

export function inspectWorker9Database(env) {
  try {
    const data = requireWorker9DatabaseUrl(env);
    const objects = JSON.parse(execDocker("inspect", data.containerId));
    const docker = objects.length === 1 ? objects[0] : undefined;
    const port = docker?.NetworkSettings?.Ports?.["5432/tcp"];
    const list = execDocker("ps", "-aq", "--filter", `label=vaylet.owner=${owner}`);
    if (!/^[a-f0-9]{12,64}$/.test(list) || !data.containerId.startsWith(list))
      throw new Error(denied);
    if (docker?.Id !== data.containerId ||
        docker?.Name !== `/${data.containerName}` ||
        docker?.Image !== imageId || docker?.Config?.Image !== image ||
        docker?.State?.Status !== "running" ||
        docker?.Config?.Labels?.["vaylet.owner"] !== owner ||
        docker?.Config?.Labels?.["vaylet.issue"] !== "215" ||
        docker?.Config?.Labels?.["vaylet.task"] !== "287" ||
        docker?.Config?.Labels?.["vaylet.run"] !== data.runId ||
        !docker?.Config?.Env?.includes("POSTGRES_USER=issue215_owner") ||
        !docker?.Config?.Env?.includes("POSTGRES_DB=issue215_empty") ||
        !Array.isArray(port) || port.length !== 1 ||
        port[0]?.HostIp !== "127.0.0.1" ||
        port[0]?.HostPort !== new URL(data.databaseUrl).port ||
        !docker?.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"] ||
        !Array.isArray(docker?.Mounts) || docker.Mounts.length !== 0)
      throw new Error(denied);
    return data.databaseUrl;
  } catch {
    throw new Error(denied);
  }
}

export function assertWorker9DatabaseIdentity(identity) {
  if (identity?.database !== "issue215_empty" ||
      identity?.actor !== "issue215_owner" ||
      identity?.session_role !== "issue215_owner" ||
      identity?.database_owner !== "issue215_owner" ||
      identity?.port !== 5432 || identity?.recovery !== false ||
      identity?.can_create_db !== true || identity?.can_create_role !== true ||
      identity?.accepts_connections !== true ||
      !Number.isInteger(identity?.version) ||
      identity.version < 170000 || identity.version >= 180000)
    throw new Error(denied);
}
