import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const loadFromDatabase = createRequire(new URL("../package.json", import.meta.url));
const approvedTarget = Object.freeze({
  hostname: "127.0.0.1",
  port: "45432",
  username: "vaylet_test_admin",
  pathname: "/vaylet_test",
});
const protectedPostgresEnvironment = [
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE",
  "PGOPTIONS", "PGSERVICEFILE",
];

/** Pure validation. No child process, connection, lease or stale-owner recovery. */
export function assertIssue429PrivateTarget(env = process.env) {
  const raw = env.TEST_DATABASE_URL;
  if (!raw || env.NODE_ENV !== "test" ||
      env.ISSUE429_W2_PG17_LEASE !== "ATTESTED_EXCLUSIVE" ||
      env.VAYLET_TEST_CLUSTER_RUN_ID || env.VAYLET_TEST_RUN_ID ||
      protectedPostgresEnvironment.some((key) => env[key])) {
    throw new Error(
      "Issue429 private OCR requires explicitly attested, isolated PG17 test configuration.",
    );
  }
  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Issue429 private OCR refuses malformed test database target.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      Object.entries(approvedTarget).some(
        ([field, expected]) => target[field] !== expected,
      ) ||
      !target.password || target.search || target.hash) {
    throw new Error("Issue429 private OCR refuses nonisolated PostgreSQL target.");
  }
  return raw;
}

async function verifyPostgres(url) {
  const { Client } = loadFromDatabase("pg");
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
    statement_timeout: 4000,
  });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT current_database() AS db,current_user AS actor,
        session_user AS session_role,pg_get_userbyid(d.datdba) AS owner,
        pg_is_in_recovery() AS recovery,inet_server_port() AS internal_port,
        current_setting('server_version_num')::integer AS version,
        r.rolcreatedb AS createdb,r.rolcreaterole AS createrole
      FROM pg_database AS d
      JOIN pg_roles AS r ON r.rolname=current_user
      WHERE d.datname=current_database()`);
    const row = result.rows.length === 1 ? result.rows[0] : undefined;
    if (row?.db !== "vaylet_test" || row.actor !== "vaylet_test_admin" ||
        row.session_role !== "vaylet_test_admin" ||
        row.owner !== "vaylet_test_admin" || row.recovery !== false ||
        row.internal_port !== 5432 || row.createdb !== true ||
        row.createrole !== true || row.version < 170000 ||
        row.version >= 180000) {
      throw new Error("Issue429 OCR live PostgreSQL17 identity mismatch.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function verifyLocalDocker() {
  const inspected = JSON.parse(execFileSync("docker", [
    "inspect", "vaylet-test-postgres",
  ], { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: "pipe" }));
  const target = inspected.length === 1 ? inspected[0] : undefined;
  const ports = target?.NetworkSettings?.Ports?.["5432/tcp"];
  if (target?.Name !== "/vaylet-test-postgres" ||
      !/^postgres:17(?:[.-]|$)/.test(target.Config?.Image ?? "") ||
      target.State?.Status !== "running" ||
      !target.Config?.Env?.includes("POSTGRES_USER=vaylet_test_admin") ||
      !target.Config?.Env?.includes("POSTGRES_DB=vaylet_test") ||
      !Array.isArray(ports) || ports.length !== 1 ||
      ports[0].HostIp !== "127.0.0.1" ||
      ports[0].HostPort !== "45432" ||
      target.Mounts?.some((mount) => mount.Type === "bind")) {
    throw new Error("Issue429 OCR dedicated Docker PostgreSQL17 identity mismatch.");
  }
}

/**
 * Invoked by the private Vitest config while loading, and repeated by its
 * globalSetup. No generic PostgreSQL harness may run before this completes.
 * Injectable probes allow negative tests without requiring any live database.
 */
export async function preflightIssue429BeforeLease(
  env = process.env,
  probes = { verifyDocker: verifyLocalDocker, verifyDatabase: verifyPostgres },
) {
  const url = assertIssue429PrivateTarget(env);
  try {
    await probes.verifyDocker();
    await probes.verifyDatabase(url);
  } catch {
    throw new Error("Issue429 private OCR PostgreSQL17 prelease attestation failed.");
  }
  return url;
}
