// R2 W6: destructive operations are impossible without an expiring Prime lease.
// Run with no arguments for an offline source check; --execute requires two disposable DBs.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseRoot = join(root, "packages/database");
const prismaCli = join(databaseRoot, "node_modules/prisma/build/index.js");
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

function checkedUrl(raw, database, port) {
  assert(typeof raw === "string" && raw.length > 0, "A task-specific database URL is required");
  const url = new URL(raw);
  assert(["postgres:", "postgresql:"].includes(url.protocol), "PostgreSQL required");
  assert(url.hostname === "127.0.0.1" && Number(url.port) === port,
    "Only the attested loopback Docker port is allowed");
  assert(url.pathname === `/${database}` && !url.search && !url.hash,
    "Unexpected database identity or URL options");
  assert(/^[a-z_][a-z0-9_]{0,62}$/.test(decodeURIComponent(url.username)) && !!url.password,
    "Explicit safe database credentials required");
  return url;
}

export function getAttestedTargets() {
  assert(process.env.NODE_ENV !== "production",
    "W6 proof cannot execute under a production runtime");
  assert(process.env.ISSUE300_W6_ENABLE === "EXECUTE_OWNED_DISPOSABLE_ONLY",
    "W6 execution requires an explicit, separate opt-in");
  const path = process.env.ISSUE300_W6_LEASE_PATH;
  assert(!!path && existsSync(path), "Prime-issued W6 lease file is missing");
  const lease = JSON.parse(readFileSync(path, "utf8"));
  assert(lease.project === "issue300" && lease.issuedBy === "prime" &&
    lease.issuedTo === "w6" && lease.exclusive === true && lease.disposable === true,
  "A Prime-exclusive disposable W6 lease is mandatory");
  assert(/^issue300-w6-[a-z0-9-]{8,}$/i.test(lease.leaseId) &&
    typeof lease.candidateSha === "string" && /^[0-9a-f]{40}$/.test(lease.candidateSha) &&
    Date.parse(lease.expiresAt) > Date.now() && Date.parse(lease.expiresAt) < Date.now() + 86400000,
  "Missing, invalid or expired candidate-specific W6 lease");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert(head === lease.candidateSha, "Current code SHA differs from the attested candidate");
  for (const index of [44, 93, 94, 95]) {
    const name = migrations[index];
    assert(lease.migrationChecksums?.[name] === migrationDigest(name),
      `Prime lease checksum does not match immutable migration ${index + 1}`);
  }
  assert(/^[0-9a-f]{64}$/.test(lease.containerId) &&
    /^issue300_w6_[a-z0-9_]{6,}$/.test(lease.volumeName) &&
    Number.isInteger(lease.port) && lease.port > 1024 &&
    ![5432, 55480].includes(lease.port), "Unsafe cluster identity/port");
  const docker = JSON.parse(execFileSync("docker", ["inspect", lease.containerId],
    { encoding: "utf8", windowsHide: true }))[0];
  const published = docker?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert(docker?.Id === lease.containerId && docker.State?.Running === true &&
    docker.Name === `/${lease.containerName}` &&
    docker.Mounts?.some((mount) => mount.Name === lease.volumeName) &&
    published.some((x) => x.HostIp === "127.0.0.1" && Number(x.HostPort) === lease.port),
  "Docker container, dedicated volume or port no longer matches Prime's lease");
  const result = { leaseId: lease.leaseId, candidateSha: head, port: lease.port };
  for (const kind of ["fresh", "upgrade"]) {
    const db = lease.databases?.[kind];
    assert(/^issue300_w6_[a-z0-9_]{6,}$/.test(db ?? ""), "Unowned W6 database name");
    const migrationUrl = process.env[`ISSUE300_W6_${kind.toUpperCase()}_MIGRATION_URL`];
    const runtimeUrl = process.env[`ISSUE300_W6_${kind.toUpperCase()}_RUNTIME_URL`];
    const migration = checkedUrl(migrationUrl, db, lease.port);
    const runtime = checkedUrl(runtimeUrl, db, lease.port);
    assert(migration.username !== runtime.username && migration.password !== runtime.password,
      "Migration/runtime credentials must differ");
    assert(/^issue300_w6_[a-z0-9_]{6,}$/.test(decodeURIComponent(runtime.username)),
      "Runtime provisioner may only create a uniquely task-owned role");
    result[kind] = { database: db, migrationUrl, runtimeUrl,
      migrationRole: decodeURIComponent(migration.username),
      runtimeRole: decodeURIComponent(runtime.username) };
  }
  assert(result.fresh.database !== result.upgrade.database &&
    result.fresh.runtimeRole !== result.upgrade.runtimeRole,
  "Fresh and upgrade fixtures must have separate databases and runtime roles");
  return result;
}

export function pgClient(url) {
  const require = createRequire(join(databaseRoot, "package.json"));
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
      cwd: databaseRoot, windowsHide: true,
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
  const targets = getAttestedTargets();
  assert(existsSync(prismaCli), "Install exact workspace dependencies before database execution");
  const clients = [pgClient(targets.fresh.migrationUrl), pgClient(targets.upgrade.migrationUrl)];
  await Promise.all(clients.map((client) => client.connect()));
  let legacy;
  try {
    for (let i = 0; i < 2; i++) {
      const client = clients[i];
      const info = (await client.query(
        "SELECT current_database() AS db, current_user AS role, current_setting('server_version_num')::int AS version, pg_is_in_recovery() AS replica" )).rows[0];
      const target = i === 0 ? targets.fresh : targets.upgrade;
      assert(info.db === target.database && info.role === target.migrationRole &&
        info.version >= 170000 && info.version < 180000 && info.replica === false,
      "Wrong database, role or PostgreSQL version; no migration allowed");
    }
    const fresh = await readHistory(clients[0]);
    const upgrade = await readHistory(clients[1]);
    assert(fresh.length === 0 &&
      (await clients[0].query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'" )).rows[0].n === 0,
    "Fresh database is not empty");
    assert(JSON.stringify(upgrade) === JSON.stringify(migrations.slice(0, 93)),
      "Upgrade database must be cleanly committed at exactly migration 93");
    legacy = await snapshotLegacy(clients[1]);
    assert(Object.values(legacy).some((value) => value > 0),
      "Populated upgrade fixture required; empty migration upgrade is insufficient");
  } finally { await Promise.all(clients.map((client) => client.end())); }
  await migrate(targets.fresh.migrationUrl, targets.fresh.runtimeUrl);
  await migrate(targets.upgrade.migrationUrl, targets.upgrade.runtimeUrl);
  const checks = [];
  for (const target of [targets.fresh, targets.upgrade]) {
    const client = pgClient(target.migrationUrl);
    await client.connect();
    try {
      checks.push({ database: target.database, ...await verify96(client) });
      if (target === targets.upgrade) {
        const after = await snapshotLegacy(client);
        for (const table of tables) {
          assert(after[table] === legacy[table], `Unexpected ${table} history rewrite`);
          if (!["audit_events", "valet_sessions"].includes(table)) {
            const q = await client.query(
              `SELECT count(*)::int AS n FROM public.${table} WHERE pagination_birth_xid IS NULL`);
            assert(q.rows[0].n === legacy[table], `${table}: historical birth marker backfilled`);
          }
        }
        checks.push({ legacyCountsPreserved: true,
          pre45NullAudit: legacy.audit_events_legacy_null,
          pre45NullSession: legacy.valet_sessions_legacy_null });
      }
    } finally { await client.end(); }
  }
  checks.push(await heldWriterLockProof(targets.upgrade.migrationUrl));
  console.log(JSON.stringify({ verdict: "PARTIAL", leaseId: targets.leaseId,
    candidateSha: targets.candidateSha, checks,
    gaps: ["Interrupted real migration", "overlapping concurrent migration runners",
      "migration 94/95 intermediate commit prefixes", "actual writer at activation", "backward application runtime"] }, null, 2));
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
