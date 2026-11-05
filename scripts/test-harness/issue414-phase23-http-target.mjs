import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { preflightIssue215TestTarget } from "../../packages/database/src/condition-photo-p1-test-target.mjs";
import { assertIssue414Phase23HttpTestTarget } from "./invocation-lease.mjs";

const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);

function verifyLocalDocker() {
  let targets;
  try {
    targets = JSON.parse(
      execFileSync("docker", ["inspect", "vaylet-test-postgres"], {
        encoding: "utf8",
        timeout: 5_000,
        windowsHide: true,
        stdio: "pipe",
      }),
    );
  } catch {
    throw new Error("Issue414 P23 HTTP refuses unverified local Docker PG17.");
  }
  const target = targets?.length === 1 ? targets[0] : undefined;
  const ports = target?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    target?.Name !== "/vaylet-test-postgres" ||
    !/^postgres:17(?:[.-]|$)/.test(target?.Config?.Image ?? "") ||
    target?.State?.Status !== "running" ||
    !target?.Config?.Env?.includes("POSTGRES_USER=vaylet_test_admin") ||
    !target?.Config?.Env?.includes("POSTGRES_DB=vaylet_test") ||
    !Array.isArray(ports) ||
    ports.length !== 1 ||
    ports[0]?.HostIp !== "127.0.0.1" ||
    ports[0]?.HostPort !== "45432" ||
    target?.Mounts?.some((mount) => mount.Type === "bind")
  ) {
    throw new Error("Issue414 P23 HTTP local Docker identity/port mismatch.");
  }
}

async function verifyLocalPostgres(databaseUrl) {
  const pg = requireApi("pg");
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 4_000,
  });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT current_database() AS database, current_user AS actor,
        session_user AS session_role, owner.rolname AS database_owner,
        inet_server_port() AS port, pg_is_in_recovery() AS recovery,
        role.rolcreatedb AS can_create_db, role.rolcreaterole AS can_create_role,
        current_setting('server_version_num')::integer AS version
      FROM pg_database database
      JOIN pg_roles owner ON owner.oid=database.datdba
      JOIN pg_roles role ON role.rolname=current_user
      WHERE database.datname=current_database()`);
    const id = result.rows.length === 1 ? result.rows[0] : undefined;
    if (
      id?.database !== "vaylet_test" ||
      id.actor !== "vaylet_test_admin" ||
      id.session_role !== "vaylet_test_admin" ||
      id.database_owner !== "vaylet_test_admin" ||
      id.port !== 5432 ||
      id.recovery !== false ||
      id.can_create_db !== true ||
      id.can_create_role !== true ||
      !Number.isInteger(id.version) ||
      id.version < 170000 ||
      id.version >= 180000
    ) {
      throw new Error("Issue414 P23 HTTP local PostgreSQL identity mismatch.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/** Attest the actual disposable DB before a lease or stale-owner recovery. */
export async function preflightIssue414Phase23HttpBeforeLease() {
  const url = assertIssue414Phase23HttpTestTarget();
  if (process.env.VAYLET_ISSUE215_TEST_TARGET === "ci") {
    const pg = requireApi("pg");
    await preflightIssue215TestTarget(pg.Client, "api-postgres-issue215");
  } else {
    verifyLocalDocker();
    await verifyLocalPostgres(url);
  }
}
