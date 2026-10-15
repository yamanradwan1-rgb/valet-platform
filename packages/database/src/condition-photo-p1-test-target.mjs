import { execFileSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

import {
  assertIssue215CiDockerTarget,
  assertIssue215CiLiveIdentity,
  requireIssue215CiUrl,
} from "./condition-photo-p1-ci-target.mjs";

const targetError = "Issue 215 test target is not the verified task-owned disposable PostgreSQL container.";
const protectedProjects = new Set(["database-postgres-issue215", "api-postgres-issue215"]);
// Fixed identity of the explicitly reviewed Issue-215-only Docker/volume pair.
// Recreating the container requires a new reviewed test-target attestation.
const expectedContainerId = "9e5631c9cbd28ed1885923e2bfdd2ae3442f25bc3fa63f80b57c8327bf4c46cc";
const expectedVolume = "83d0792c7318ace85d94f3824619542a4f8344226b0ff16d091d307e428dc72e";

export function requireIssue215TestUrl(env = process.env) {
  if (env.VAYLET_ISSUE215_TEST_TARGET === "ci") {
    if (env.NODE_ENV !== "test" ||
        !protectedProjects.has(env.VAYLET_TEST_PROJECT) ||
        !env.VAYLET_TEST_RUN_ID) throw new Error(targetError);
    return requireIssue215CiUrl(env);
  }
  if (env.VAYLET_ISSUE215_TEST_TARGET) throw new Error(targetError);
  const value = env.TEST_DATABASE_URL;
  if (!value || value.trim() !== value) throw new Error(targetError);
  let url;
  try { url = new URL(value); } catch { throw new Error(targetError); }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" || url.port !== "58487" ||
    url.pathname !== "/issue215_empty" || url.username !== "issue215_owner" ||
    !url.password || url.search !== "" || url.hash !== "" ||
    env.NODE_ENV !== "test" ||
    !protectedProjects.has(env.VAYLET_TEST_PROJECT) ||
    !env.VAYLET_TEST_RUN_ID ||
    ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE", "PGOPTIONS", "PGSSLMODE", "PGSERVICEFILE"].some(
      (key) => Boolean(env[key]),
    )
  ) throw new Error(targetError);
  return value;
}

export function assertIssue215DockerTarget(targets) {
  const target = targets.length === 1 ? targets[0] : undefined;
  const ports = target?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    target?.Id !== expectedContainerId ||
    target?.Name !== "/vaylet_issue215_p1_local" ||
    target.Config?.Image !== "postgres:16-alpine" ||
    target.State?.Status !== "running" ||
    !target.Config?.Env?.includes("POSTGRES_USER=issue215_owner") ||
    !target.Config?.Env?.includes("POSTGRES_DB=issue215_empty") ||
    ports?.length !== 1 || ports[0]?.HostIp !== "127.0.0.1" ||
    ports[0]?.HostPort !== "58487" ||
    !target.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === expectedVolume && mount.Destination === "/var/lib/postgresql/data") ||
    target.Mounts.some((mount) => mount.Type === "bind")
  ) throw new Error(targetError);
}

export function inspectIssue215DockerTarget() {
  try {
    const ci = process.env.VAYLET_ISSUE215_TEST_TARGET === "ci";
    const identifier = ci ? process.env.VAYLET_ISSUE215_CI_POSTGRES_CONTAINER_ID : "vaylet_issue215_p1_local";
    if (!identifier) throw new Error(targetError);
    const output = execFileSync("docker", ["inspect", identifier], {
      encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe",
    });
    if (ci) assertIssue215CiDockerTarget(JSON.parse(output), process.env);
    else assertIssue215DockerTarget(JSON.parse(output));
  } catch { throw new Error(targetError); }
}

export function assertIssue215LiveIdentity(identity) {
  if (
    identity?.database !== "issue215_empty" ||
    identity.actor !== "issue215_owner" ||
    identity.session_role !== "issue215_owner" ||
    identity.database_owner !== "issue215_owner" ||
    identity.port !== 5432 || identity.recovery !== false ||
    identity.can_create_db !== true || identity.can_create_role !== true ||
    identity.accepts_connections !== true ||
    !Number.isInteger(identity.version) || identity.version < 160000 || identity.version >= 170000
  ) throw new Error(targetError);
}

export async function verifyIssue215Bootstrap(client) {
  inspectIssue215DockerTarget();
  const result = await client.query(`
    SELECT current_database() AS database, current_user AS actor,
      session_user AS session_role, owner.rolname AS database_owner,
      inet_server_port() AS port, pg_is_in_recovery() AS recovery,
      role.rolcreatedb AS can_create_db, role.rolcreaterole AS can_create_role,
      current_setting('server_version_num')::integer AS version,
      database.datallowconn AS accepts_connections
    FROM pg_database database
    JOIN pg_roles owner ON owner.oid=database.datdba
    JOIN pg_roles role ON role.rolname=current_user
    WHERE database.datname=current_database()`);
  const identity = result.rows.length === 1 ? result.rows[0] : undefined;
  if (process.env.VAYLET_ISSUE215_TEST_TARGET === "ci") assertIssue215CiLiveIdentity(identity);
  else assertIssue215LiveIdentity(identity);
}

export async function preflightIssue215TestTarget(ClientCtor, projectName) {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "test") throw new Error(targetError);
  const url = requireIssue215TestUrl({
    ...process.env,
    NODE_ENV: "test",
    VAYLET_TEST_PROJECT: projectName,
    VAYLET_TEST_RUN_ID: process.env.VAYLET_TEST_RUN_ID ?? "before-lease-read-only",
  });
  const client = new ClientCtor({ connectionString: url });
  try {
    await client.connect();
    await verifyIssue215Bootstrap(client);
  } finally {
    try { await client.end(); }
    catch { /* Preserve the failed bootstrap preflight result. */ }
  }
}
