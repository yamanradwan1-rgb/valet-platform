/* global process, console, Buffer, fetch, AbortSignal, URL */
// Owner-side ONLY. --issue inspects actual local processes, HTTP and read-only PG;
// --check-source imports without network, DB, Docker or signing-key access.
import assert from "node:assert/strict";
import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readV2Evidence } from "./issue300-r2-v2-versioned-evidence.mjs";
import { publishSignedPreflight } from "./issue300-r2-browser-preflight-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owned = join(root, "tmp/issue300-r2-v2-prime-owned");
const v2Owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
const spki = "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
const key = createPublicKey({ key: Buffer.from(spki, "base64"), format: "der", type: "spki" });
const exact = Object.freeze({
  dashboardOrigin: "http://127.0.0.1:3117",
  apiOrigin: "http://127.0.0.1:3167",
  host: "127.0.0.1",
  port: 58387,
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  label: "issue300-r2-w7-acceptance-v2",
});
const hex64 = /^[a-f0-9]{64}$/;
const sha = (v) => createHash("sha256").update(v).digest("hex");
const command = (program, args) => execFileSync(program, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 }).trim();

export function checkSource({ head, clean, env, lease, resource, now }) {
  assert(/^[a-f0-9]{40}$/.test(head) && clean && env.NODE_ENV === "test" && env.ISSUE300_W7_OWNER_BROWSER_ISSUE_ENABLE === "1" && env.ISSUE300_W7_TEST_ONLY_BROWSER_PROOF === "1" && env.ISSUE300_R2_CANDIDATE_SHA === head, "GAP: no clean, test-only final SHA");
  assert(/^issue300-r2-w7-[a-z0-9-]{8,}$/.test(lease) && env.ISSUE300_W7_EXCLUSIVE_LEASE === lease, "GAP: exclusive browser lease absent");
  assert(resource?.candidateSha === head && resource.leaseId === lease && hex64.test(resource.containerId ?? "") && Number.isFinite(Date.parse(resource.postgresStartedAt)), "GAP: V2 owned resource manifest");
  for (const [k, v] of Object.entries(exact).filter(([k]) => !k.endsWith("Origin"))) assert.equal(k === "label" ? resource.containerLabel : resource[k], v, `GAP: V2 resource mismatch ${k}`);
  assert(Number.isFinite(now), "GAP: invalid issuer wall clock");
  return { head, lease };
}

export function checkDocker(docker, resource) {
  assert(docker?.Id === resource.containerId && docker?.State?.Running === true && docker?.Name === `/${exact.containerName}` && docker.Config?.Labels?.["com.vaylet.task"] === exact.label, "GAP: wrong active V2 Docker instance");
  const ports = docker.NetworkSettings?.Ports;
  assert(Object.keys(ports ?? {}).length === 1 && ports["5432/tcp"]?.length === 1 && ports["5432/tcp"][0].HostIp === exact.host && ports["5432/tcp"][0].HostPort === String(exact.port), "GAP: V2 loopback PG mapping");
  assert(docker.Mounts?.filter((m) => m.Type === "volume" && m.Name === exact.volume && m.Destination === "/var/lib/postgresql/data").length === 1, "GAP: foreign PG volume");
  return resource.containerId;
}

export function checkProcess(evidence, kind, digest, head, latestBuildTime, now) {
  const port = kind === "api" ? 3167 : 3117;
  const entry = kind === "api" ? join(root, "apps/api/dist/main.js") : join(root, "apps/dashboard/.next/standalone/apps/dashboard/server.js");
  const norm = (s) =>
    String(s ?? "")
      .replaceAll("/", "\\")
      .toLowerCase();
  const argv =
    String(evidence?.commandLine ?? "")
      .match(/"[^"]+"|\S+/g)
      ?.map((s) => s.replace(/^"|"$/g, "")) ?? [];
  assert(
    evidence?.port === port &&
      evidence.localAddress === "127.0.0.1" &&
      Number.isInteger(evidence.pid) &&
      evidence.pid > 0 &&
      argv.length === 2 &&
      norm(argv[0]) === norm(evidence.executablePath) &&
      norm(argv[1]) === norm(entry) &&
      norm(evidence.executablePath).endsWith("\\node.exe"),
    `GAP: foreign ${kind} process`,
  );
  const start = Date.parse(evidence.startedAt);
  assert(Number.isFinite(start) && start >= latestBuildTime && start <= now && hex64.test(digest) && /^[a-f0-9]{40}$/.test(head), `GAP: ${kind} build/runtime epoch`);
  return {
    identity: { pid: evidence.pid, startedAt: evidence.startedAt },
    signed: { loopbackOnly: true, listenerVerified: true, processOwned: true, candidateSha: head, bundleSha256: digest },
  };
}

function bundle(base, required) {
  const files = readdirSync(base, { withFileTypes: true, recursive: true })
    .map((item) => {
      assert(!item.isSymbolicLink());
      return item.isFile() ? join(item.parentPath, item.name) : null;
    })
    .filter(Boolean);
  assert(files.length > 0 && files.length <= 12000 && files.includes(required), "GAP: incomplete compiled bundle");
  const hash = createHash("sha256");
  let latest = 0;
  for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
    const meta = lstatSync(file);
    assert(meta.isFile() && !meta.isSymbolicLink());
    latest = Math.max(latest, meta.mtimeMs);
    hash.update(relative(base, file).replaceAll("\\", "/")).update("\0").update(readFileSync(file)).update("\0");
  }
  return { digest: hash.digest("hex"), latest };
}

function osProcess(port) {
  // OS-owned socket→PID→command/start identity; no user-supplied PID/path.
  const ps =
    "$ErrorActionPreference='Stop';$c=@(Get-NetTCPConnection -LocalPort " +
    port +
    " -State Listen);if($c.Count -ne 1 -or $c[0].LocalAddress -ne '127.0.0.1'){throw 'foreign socket'};" +
    "$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c[0].OwningProcess);" +
    "if(!$p){throw 'no owning process'};@{port=" +
    port +
    ";localAddress=$c[0].LocalAddress;pid=[int]$p.ProcessId;commandLine=$p.CommandLine;" +
    "executablePath=$p.ExecutablePath;startedAt=$p.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress";
  return JSON.parse(command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]));
}

function connectionUrl(value, role) {
  const url = new URL(value ?? "");
  assert(
    url.protocol === "postgresql:" && url.hostname === exact.host && url.port === String(exact.port) && url.pathname === `/${exact.database}` && decodeURIComponent(url.username) === role && url.password.length > 0 && !url.search && !url.hash,
    "GAP: wrong privileged DB target",
  );
  return url.href;
}

export function checkPostgres(rows, source, sourceChecksums) {
  assert(rows.identity?.name === exact.database && rows.identity.role === exact.migrationRole && rows.identity.version === 170010 && new Date(rows.identity.started).toISOString() === source.postgresStartedAt, "GAP: changed PG identity/role/version/start");
  assert(rows.runtime?.role === exact.runtimeRole && rows.runtime.login === exact.runtimeRole && rows.runtime.audit_update === false && rows.runtime.ledger_read === false, "GAP: unprivileged runtime role/ACL mismatch");
  assert(
    rows.triggers.birth === 12 &&
      rows.triggers.immutable === 6 &&
      rows.migrations.length === 96 &&
      Object.keys(source.migrationChecksums ?? {}).length === 96 &&
      Object.keys(sourceChecksums ?? {}).length === 96 &&
      new Set(rows.migrations.map((r) => r.migration_name)).size === 96 &&
      rows.roleFlags &&
      Object.values(rows.roleFlags).every((v) => v === false),
    "GAP: migration/trigger count",
  );
  for (const row of rows.migrations) assert(row.finished_at && !row.rolled_back_at && source.migrationChecksums[row.migration_name] === row.checksum && sourceChecksums[row.migration_name] === row.checksum, "GAP: migration SQL checksum mismatch");
}

function migrationSources() {
  const base = join(root, "packages/database/prisma/migrations");
  const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert(entries.length === 96, "GAP: exact migration source count");
  return Object.fromEntries(entries.map((e) => [e.name, sha(readFileSync(join(base, e.name, "migration.sql")))]));
}

async function inspectDatabase(resource) {
  const require = createRequire(join(root, "apps/api/package.json"));
  const { Client } = require("pg");
  const urls = [connectionUrl(process.env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL, exact.migrationRole), connectionUrl(process.env.ISSUE300_R2_OWNED_RUNTIME_DATABASE_URL, exact.runtimeRole)];
  const clients = urls.map((connectionString) => new Client({ connectionString, connectionTimeoutMillis: 3000 }));
  try {
    for (const c of clients) {
      await c.connect();
      await c.query("BEGIN READ ONLY");
    }
    const [migration, runtime] = clients;
    const one = async (client, sql) => (await client.query(sql)).rows[0];
    const identity = await one(migration, "SELECT current_database() name,current_user role,current_setting('server_version_num')::int version,pg_postmaster_start_time() started");
    const role = await one(runtime, "SELECT current_user role,session_user login,has_table_privilege(current_user,'public.audit_events','UPDATE') audit_update,has_table_privilege(current_user,'public._prisma_migrations','SELECT') ledger_read");
    const triggers = await one(migration, "SELECT count(*) FILTER(WHERE tgname LIKE '%pagination_birth%')::int birth,count(*) FILTER(WHERE tgname LIKE '%issue300%immutable')::int immutable FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')");
    const migrations = (await migration.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations")).rows;
    const roleFlags = await one(migration, `SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='issue300_r2_w7_runtime_v2'`);
    checkPostgres({ identity, runtime: role, triggers, migrations, roleFlags }, resource, migrationSources());
  } finally {
    for (const c of clients) {
      try {
        await c.query("ROLLBACK");
      } catch {
        /* no mutation */
      }
      await c.end().catch(() => {});
    }
  }
}

async function health() {
  for (const [uri, acceptable] of [
    [exact.apiOrigin + "/health/live", [200]],
    [exact.apiOrigin + "/health/ready", [200]],
    [exact.dashboardOrigin + "/audit-log", [200, 302, 307, 308]],
  ]) {
    const response = await fetch(uri, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      headers: { "cache-control": "no-store" },
    });
    assert(acceptable.includes(response.status), "GAP: scoped live HTTP health failed");
    await response.body?.cancel();
  }
}

export function buildPreflight(input) {
  const { head, lease, now, resource, api, dashboard, dockerId } = input;
  assert(dockerId === resource.containerId && api.signed?.bundleSha256 && dashboard.signed?.bundleSha256);
  return {
    kind: "ISSUE300_W7_V2_INDEPENDENT_LIVE_PREFLIGHT_V1",
    candidateSha: head,
    leaseId: lease,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    dashboardOrigin: exact.dashboardOrigin,
    apiOrigin: exact.apiOrigin,
    apiRewriteOrigin: exact.apiOrigin,
    dashboard: dashboard.signed,
    api: { ...api.signed, ordinaryRoleVerified: true, guardedProofIsolated: true },
    postgres: {
      ...Object.fromEntries(Object.entries(exact).filter(([k]) => !k.endsWith("Origin"))),
      containerId: dockerId,
      serverVersionNum: 170010,
      migrationsApplied: 96,
      migrationChecksumsVerified: true,
      birthTriggers: 12,
      immutableTriggers: 6,
      actualRolesVerified: true,
      loopbackOnly: true,
      containerRunning: true,
      volumeOwned: true,
      labelVerified: true,
    },
    testOnly: true,
    exclusiveLeaseVerified: true,
  };
}

async function issue() {
  const head = command("git", ["rev-parse", "HEAD"]);
  const clean = command("git", ["status", "--porcelain=v1"]) === "";
  const lease = process.env.ISSUE300_W7_EXCLUSIVE_LEASE;
  const resource = JSON.parse(readV2Evidence(v2Owned, "manifest", head,
    lease).bytes.toString("utf8"));
  checkSource({ head, clean, env: process.env, lease, resource, now: Date.now() });
  const currentDocker = () => JSON.parse(command("docker", ["inspect", exact.containerName]))[0];
  const dockerId = checkDocker(currentDocker(), resource);
  const apiBuild = bundle(join(root, "apps/api/dist"), join(root, "apps/api/dist/main.js"));
  const dashboardRoot = join(root, "apps/dashboard/.next/standalone");
  const dashBuild = bundle(dashboardRoot, join(dashboardRoot, "apps/dashboard/server.js"));
  const processPair = () => ({
    api: checkProcess(osProcess(3167), "api", apiBuild.digest, head, apiBuild.latest, Date.now()),
    dashboard: checkProcess(osProcess(3117), "dashboard", dashBuild.digest, head, dashBuild.latest, Date.now()),
  });
  const first = processPair();
  assert(resource.apiBundleSha256 === apiBuild.digest, "GAP: wrong API compiled artifact");
  await inspectDatabase(resource);
  await health();
  const second = processPair();
  assert(JSON.stringify(first) === JSON.stringify(second), "GAP: process/build changed during read-only proof");
  checkDocker(currentDocker(), resource);
  assert(bundle(join(root, "apps/api/dist"), join(root, "apps/api/dist/main.js")).digest === apiBuild.digest && bundle(dashboardRoot, join(dashboardRoot, "apps/dashboard/server.js")).digest === dashBuild.digest, "GAP: build changed during attestation");
  const issuedAt = Date.now();
  const bytes = Buffer.from(JSON.stringify(buildPreflight({ head, lease, now: issuedAt, resource, dockerId, ...second })));
  const privatePath = join(owned, "issuer-private.pem");
  const privateStat = lstatSync(privatePath);
  assert(privateStat.isFile() && !privateStat.isSymbolicLink() && privateStat.size > 0 && privateStat.size <= 4096, "GAP: Owner issuer key is not a private regular file");
  const privateKey = readFileSync(privatePath);
  const signature = sign(null, bytes, privateKey);
  assert(signature.length === 64 && verify(null, bytes, key, signature), "GAP: owner signing key mismatch");
  // Per-SHA/lease/epoch files: no fixed alias to overwrite on renewal.
  const output = publishSignedPreflight(owned, bytes, signature, key);
  console.log(`PASS live V2 browser preflight signed; SHA256=${sha(bytes)}; 60s TTL; file=${output.path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--issue") throw Error("Usage: node scripts/issue300-r2-browser-live-preflight.mjs --issue (Prime only)");
  await issue();
}
