// R2 W6: Prime's exclusive lease is bound to the named, isolated new R2 PG17.
// Default --check is static; --execute only mutates the specified empty R2 DB.
import { execFileSync, spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseRoot = join(root, "packages/database");
// Dependency tooling was installed in Prime's R2 worktree; W6 remains source-isolated.
const provisionRoot = resolve(root, "../issue-300-final-closure-r2/packages/database");
const prismaCli = join(provisionRoot, "node_modules/prisma/build/index.js");
const sourceSha = "ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687";
const tables = ["audit_events", "valet_sessions", "key_custody_events",
  "dispatch_events", "incidents", "tasks"];
const migrations = readdirSync(join(databaseRoot, "prisma/migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const migrationDigest = (name) => createHash("sha256").update(readFileSync(
  join(databaseRoot, "prisma/migrations", name, "migration.sql"))).digest("hex");

function assert(ok, message) {
  if (!ok) throw Error(message);
}

export function validateSource() {
  const manifest = readFileSync(join(databaseRoot, "src/migration-manifest.ts"), "utf8");
  const listed = [...manifest.matchAll(/"(\d{14}_[a-z0-9_]+)"/g)].map((match) => match[1]);
  // The frozen TypeScript regression manifest ends at 93; Option A/B added 94..96.
  assert(listed.length === 93 && migrations.length === 96 &&
    JSON.stringify(listed) === JSON.stringify(migrations.slice(0, 93)) &&
    migrations[93].startsWith("20261018009400_issue_300_") &&
    migrations[94].startsWith("20261018009500_issue_300_") &&
    migrations[95].startsWith("20261018009600_issue_300_"),
  "Frozen 1..93 manifest or forward-only 94..96 set differs from expected");
  for (const n of [45, 94, 95, 96]) {
    assert(existsSync(join(databaseRoot, "prisma/migrations", migrations[n - 1], "migration.sql")),
      `Required immutable migration ${n} is missing`);
  }
  return { count: migrations.length, latest: migrations.at(-1), preservedBaseline: sourceSha };
}

export function getAttestedTarget() {
  assert(process.env.NODE_ENV !== "production",
    "W6 proof cannot execute under a production runtime");
  assert(process.env.ISSUE300_W6_ENABLE === "EXECUTE_OWNED_DISPOSABLE_ONLY",
    "W6 execution requires an explicit, separate opt-in");
  const envPath = resolve(root, "../issue-300-final-closure-r2/tmp/issue300-r2-owned/pg.env");
  assert(existsSync(envPath), "Prime-owned credentials not found at the exact agreed path");
  const allowed = new Set(["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "PGHOST", "PGPORT"]);
  const config = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter((m) => m && allowed.has(m[1]))
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
  assert(config.POSTGRES_DB === "issue300_r2" &&
    config.POSTGRES_USER === "issue300_r2_owner" &&
    config.PGHOST === "127.0.0.1" && config.PGPORT === "57285" &&
    typeof config.POSTGRES_PASSWORD === "string" && !!config.POSTGRES_PASSWORD,
  "Supplied credential metadata disagrees with Prime's new disposable R2 resource");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert(/^[a-f0-9]{40}$/.test(head), "Unable to verify W6 commit identity");
  const docker = JSON.parse(execFileSync("docker", ["inspect", "issue300_r2_pg17"],
    { encoding: "utf8", windowsHide: true }))[0];
  const published = docker?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert(/^[a-f0-9]{64}$/.test(docker?.Id ?? "") &&
    docker.Name === "/issue300_r2_pg17" &&
    docker.State?.Running === true &&
    docker.Config?.Labels?.["com.vaylet.task"] === "issue300-r2" &&
    docker.Mounts?.some((mount) => mount.Name === "issue300_r2_pgdata") &&
    published.length === 1 && published[0].HostIp === "127.0.0.1" &&
    published[0].HostPort === "57285",
  "Docker label, container, owned volume or loopback port changed; lease invalid");
  for (const name of migrations) {
    assert(migrationDigest(name) === createHash("sha256").update(readFileSync(
      join(provisionRoot, "prisma/migrations", name, "migration.sql"))).digest("hex"),
    "Prime tooling migration bytes differ from W6 frozen migration source");
  }
  const dbUrl = (username, password) => {
    const u = new URL("postgresql://127.0.0.1:57285/issue300_r2");
    u.username = username; u.password = password;
    return u.href;
  };
  // Stable local-only derived password keeps the role reusable by the next leased worker.
  const runtimeRole = "issue300_r2_w6_runtime";
  const runtimePassword = createHmac("sha256", config.POSTGRES_PASSWORD)
    .update("issue300-r2:actual-ordinary-runtime:v1").digest("hex");
  return { candidateSha: head, containerId: docker.Id, database: "issue300_r2",
    migrationRole: config.POSTGRES_USER, runtimeRole,
    migrationUrl: dbUrl(config.POSTGRES_USER, config.POSTGRES_PASSWORD),
    runtimeUrl: dbUrl(runtimeRole, runtimePassword) };
}

export function pgClient(url) {
  const require = createRequire(join(provisionRoot, "package.json"));
  const { Client } = require("pg");
  return new Client({ connectionString: url, connectionTimeoutMillis: 4000,
    statement_timeout: 15000, application_name: "issue300-w6-closure" });
}

async function readHistory(client) {
  const exists = (await client.query("SELECT to_regclass('public._prisma_migrations') AS ledger"))
    .rows[0].ledger !== null;
  if (!exists) return [];
  const { rows } = await client.query(
    "SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at, id");
  assert(rows.every((row) => row.finished_at && !row.rolled_back_at),
    "Incomplete/unknown migration outcome: catalog reconciliation required, no retry");
  assert(rows.every((row) => migrations.includes(row.migration_name) &&
    row.checksum === migrationDigest(row.migration_name)),
  "Applied migration checksums changed; stop for catalog/ledger reconciliation");
  return rows.map((row) => row.migration_name);
}

async function snapshotLegacy(client) {
  const counts = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT count(*)::integer AS n FROM public.${table}`);
    counts[table] = rows[0].n;
  }
  for (const table of ["audit_events", "valet_sessions"]) {
    const { rows } = await client.query(
      `SELECT count(*)::integer AS n FROM public.${table} WHERE pagination_birth_xid IS NULL`);
    counts[`${table}_legacy_null`] = rows[0].n;
  }
  return counts;
}

async function verify96(client) {
  const history = await readHistory(client);
  assert(JSON.stringify(history) === JSON.stringify(migrations),
    "Migration ledger and immutable 96-directory manifest disagree");
  const { rows } = await client.query(
    `SELECT c.relname AS table_name, a.attname, format_type(a.atttypid, a.atttypmod) AS type,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        AND a.attname = 'pagination_birth_xid' AND NOT a.attisdropped`, [tables]);
  assert(rows.length === tables.length && rows.every((row) =>
    row.type === "xid8" && row.default_expr?.includes("pg_current_xact_id()")),
  "XID8 column or server-owned default missing");
  const triggers = await client.query(
    `SELECT c.relname AS table_name, t.tgname, t.tgenabled
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = ANY($1::text[]) AND NOT t.tgisinternal`, [tables]);
  for (const table of tables) {
    assert(["insert", "update"].every((suffix) => triggers.rows.some((t) =>
      t.table_name === table && t.tgname === `${table}_pagination_birth_${suffix}` &&
      t.tgenabled === "O")), `XID trigger missing/disabled on ${table}`);
  }
  const immutable = triggers.rows.filter((t) => t.tgname.includes("issue300_"));
  assert(immutable.length === 6 && immutable.every((t) => t.tgenabled === "O"),
    "Option B identity/attribution immutable triggers missing or disabled");
  return { migrations: history.length, birthTriggers: 12, immutableTriggers: immutable.length };
}

async function migrate(url, runtimeUrl) {
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: provisionRoot, windowsHide: true,
      env: { ...process.env, NODE_ENV: "test", MIGRATION_DATABASE_URL: url,
        DATABASE_URL: runtimeUrl }, stdio: "ignore" });
    child.once("error", fail);
    child.once("close", (code) => code === 0 ? done() :
      fail(Error(`Prisma migrate deploy exited ${code}; inspect ledger before any retry`)));
  });
}

async function heldWriterLockProof(url) {
  const writer = pgClient(url);
  const ddl = pgClient(url);
  await writer.connect();
  await ddl.connect();
  try {
    await writer.query("BEGIN");
    await writer.query("LOCK TABLE public.tasks IN ROW EXCLUSIVE MODE");
    await ddl.query("BEGIN");
    await ddl.query("SET LOCAL lock_timeout = '300ms'");
    let denied = false;
    try { await ddl.query("LOCK TABLE public.tasks IN ACCESS EXCLUSIVE MODE"); }
    catch (error) { denied = error.code === "55P03"; }
    assert(denied, "ACCESS EXCLUSIVE DDL lock did not wait/timeout behind the writer");
    return { writerLock: "ROW EXCLUSIVE", ddlLockTimeout: "55P03" };
  } finally {
    await ddl.query("ROLLBACK").catch(() => {});
    await writer.query("ROLLBACK").catch(() => {});
    await Promise.all([ddl.end(), writer.end()]);
  }
}

async function execute() {
  const target = getAttestedTarget();
  assert(existsSync(prismaCli), "Install exact workspace dependencies before database execution");
  const client = pgClient(target.migrationUrl);
  await client.connect();
  try {
    const info = (await client.query(
      "SELECT current_database() AS db, current_user AS role, current_setting('server_version_num')::int AS version, pg_is_in_recovery() AS replica" )).rows[0];
    assert(info.db === target.database && info.role === target.migrationRole &&
      info.version === 170010 && info.replica === false,
    "Wrong database, actual login or PostgreSQL 17.10 version");
    const fresh = await readHistory(client);
    assert(fresh.length === 0 &&
      (await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0].n === 0,
    "Fresh database is not empty");
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [target.runtimeRole]);
    assert(role.rowCount === 0, "Reserved W6 ordinary role already exists; refuse to rotate its credentials");
  } finally { await client.end(); }
  await migrate(target.migrationUrl, target.runtimeUrl);
  const verified = pgClient(target.migrationUrl);
  await verified.connect();
  let checks;
  try { checks = await verify96(verified); }
  finally { await verified.end(); }
  const lock = await heldWriterLockProof(target.migrationUrl);
  console.log(JSON.stringify({ verdict: "PARTIAL", candidateSha: target.candidateSha,
    containerIdPrefix: target.containerId.slice(0, 12), database: target.database,
    postgres: "17.10", fresh0to96: "PASS", checks, lock,
    gaps: ["Populated 93→96", "Migration interruption/concurrent runners",
      "Actual writers during DDL", "Backward application runtime"] }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateSource();
  if (process.argv[2] === "--execute") {
    execute().catch((error) => { console.error(`W6 BLOCKED: ${error.message}`); process.exitCode = 1; });
  } else {
    assert(!process.argv[2] || process.argv[2] === "--check", "Unsupported W6 mode");
    console.log("W6 STATIC PASS (manifest 96/96); DB/role/interruption proof GAP until exclusive Prime lease");
  }
}
