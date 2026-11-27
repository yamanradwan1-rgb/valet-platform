import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

const image = "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085";
const root = resolve(process.cwd(), "../..");
const rolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

function requireValue(name: string, pattern: RegExp): string {
  const value = process.env[name];
  if (value === undefined || !pattern.test(value)) {
    throw new Error("Issue463 missing or invalid explicit " + name + ".");
  }
  return value;
}

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8", timeout: 10_000, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true,
  }).trim();
}

function urlFor(name: string, database: string, port: string): URL {
  const raw = process.env[name];
  if (!raw) throw new Error("Issue463 missing explicit fixture URL: " + name);
  let url: URL; try { url = new URL(raw); } catch { throw new Error("Issue463 malformed fixture URL: " + name); }
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.port !== port || url.pathname !== "/" + database ||
      !rolePattern.test(url.username) || !url.password ||
      url.search || url.hash) {
    throw new Error("Issue463 fixture URL outside attested target: " + name);
  }
  return url;
}

interface ContainerIdentity {
  Id: string;
  Name: string;
  Image: string;
  State: { Status: string };
  Config: { Labels: Record<string, string> };
  HostConfig: {
    Binds: string[] | null;
    Tmpfs: Record<string, string>;
    RestartPolicy: { Name: string };
  };
  Mounts: { Type: string }[];
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
}

function assertContainer(id: string, owner: string): string {
  if (docker(["context", "show"]) !== "desktop-linux" ||
      docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]) !==
        "npipe:////./pipe/dockerDesktopLinuxEngine") {
    throw new Error("Issue463 rejects nonlocal Docker context.");
  }
  const list = JSON.parse(docker(["inspect", id])) as ContainerIdentity[];
  const item = list.length === 1 ? list[0] : undefined;
  const ports = item?.NetworkSettings.Ports["5432/tcp"];
  if (!item || item.Id !== id || item.Image !== image ||
      item.Name !== "/vaylet-issue463-prime-p7-" + owner.slice(0, 12) ||
      item.State.Status !== "running" ||
      item.Config.Labels["vaylet.issue463.browser.owner"] !== owner ||
      item.Config.Labels["vaylet.disposable"] !== "true" ||
      item.HostConfig.RestartPolicy.Name !== "no" ||
      item.HostConfig.Binds?.length ||
      !Object.hasOwn(item.HostConfig.Tmpfs ?? {}, "/var/lib/postgresql/data") ||
      item.Mounts.some((mount) => mount.Type !== "tmpfs") ||
      !ports || ports.length !== 1 || ports[0]?.HostIp !== "127.0.0.1") {
    throw new Error("Issue463 disposable container attestation failed.");
  }
  const port = ports[0].HostPort;
  if (!/^\d{4,5}$/.test(port) || Number(port) > 65535 ||
      ["5432", "45432", "55416", "55568", "55673"].includes(port)) {
    throw new Error("Issue463 disposable port is unsafe.");
  }
  return port;
}

interface DatabaseIdentity {
  database: string;
  principal: string;
  login: string;
  version: string;
  system_id: string;
  database_owner: string;
  superuser: boolean;
  inherit: boolean;
  replication: boolean;
  bypassrls: boolean;
  createrole: boolean;
  createdb: boolean;
}

async function assertMigrationHistory(client: Client): Promise<number> {
  const directory = resolve(root, "packages/database/prisma/migrations");
  const expected = readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name).sort();
  const { rows } = await client.query<{
    migration_name: string; checksum: string;
    finished_at: Date | null; rolled_back_at: Date | null;
  }>("SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name");
  if (rows.length !== expected.length) {
    throw new Error("Issue463 migration history count mismatch.");
  }
  for (const [index, name] of expected.entries()) {
    const row = rows[index];
    const checksum = createHash("sha256")
      .update(readFileSync(resolve(directory, name, "migration.sql"))).digest("hex");
    if (row?.migration_name !== name || row.checksum !== checksum ||
        row.finished_at === null || row.rolled_back_at !== null) {
      throw new Error("Issue463 migration history mismatch: " + name);
    }
  }
  return expected.length;
}

async function assertRuntime(url: URL): Promise<void> {
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 4_000 });
  try {
    await client.connect();
    const { rows } = await client.query<{
      principal: string; login: string; unsafe: boolean;
      phase: boolean; reader: boolean; writer: boolean; browser_writer: boolean; raw: boolean;
    }>(`SELECT current_user AS principal,session_user AS login,
      (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AS unsafe,
      public.rating_feedback_is_protected() AS phase,
      has_function_privilege(current_user,
        'public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)','EXECUTE') AS reader,
      has_function_privilege(current_user,
        'public.guest_rating_submit(text,integer,text,uuid)','EXECUTE') AS writer,
      has_function_privilege(current_user,
        'public.guest_browser_rating_submit(text,integer,text,uuid)','EXECUTE') AS browser_writer,
      has_any_column_privilege(current_user,'public.guest_rating_comments','SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(current_user,'public.guest_rating_comments','DELETE,TRUNCATE') AS raw
      FROM pg_catalog.pg_roles WHERE rolname=current_user`);
    const row = rows[0];
    if (rows.length !== 1 || row?.principal !== url.username || row.login !== url.username ||
        row.unsafe !== false || row.phase !== true || row.reader !== true ||
        row.writer !== true || row.browser_writer !== true || row.raw !== false) {
      throw new Error("Issue463 actual restricted runtime identity or active test ABI mismatch.");
    }
  } finally {
    await client.end();
  }
}

/** Local integrated browser proof only; no fallback target or production release. */
export async function acquireIssue463BrowserTarget() {
  if (process.env.ISSUE463_BROWSER_QA !== "I_OWN_DISPOSABLE_463" ||
      process.env.NODE_ENV !== "test" || process.env.CI !== undefined ||
      ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"].some((key) => process.env[key])) {
    throw new Error("Issue463 requires explicit local disposable browser ownership.");
  }
  const owner = requireValue("ISSUE463_P7_OWNER", /^[0-9a-f]{32}$/);
  const id = requireValue("ISSUE463_P7_CONTAINER", /^[0-9a-f]{64}$/);
  const candidate = requireValue("ISSUE463_P7_CANDIDATE", /^[0-9a-f]{40}$/);
  const system = requireValue("RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER", /^\d{10,25}$/);
  if (git(["rev-parse", "HEAD"]) !== candidate ||
      git(["status", "--porcelain"]) !== "") {
    throw new Error("Issue463 browser candidate is not the exact clean tracked SHA.");
  }
  const port = assertContainer(id, owner);
  const database = "issue463_p7_" + owner.slice(0, 12);
  if (process.env.RATING_FEEDBACK_ATTESTED_DATABASE !== database) {
    throw new Error("Issue463 database attestation mismatch.");
  }
  const urls = [
    "MIGRATION_DATABASE_URL", "DATABASE_URL", "STAFF_AUTH_WRITER_DATABASE_URL",
    "MFA_WRITER_DATABASE_URL", "MANAGEMENT_WRITER_DATABASE_URL",
    "RATING_FEEDBACK_APPROVER_DATABASE_URL", "RATING_FEEDBACK_EXECUTOR_DATABASE_URL",
  ].map((name) => urlFor(name, database, port));
  if (new Set(urls.map((url) => url.username)).size !== urls.length ||
      new Set(urls.map((url) => url.password)).size !== urls.length) {
    throw new Error("Issue463 fixture login principals and credentials must be distinct.");
  }
  const migration = urls[0]!;
  const runtime = urls[1]!;
  if (migration.username !== "issue463_p7_migrator" ||
      runtime.username !== "issue463_p7_runtime") {
    throw new Error("Issue463 fixture principal name mismatch.");
  }
  const inside = docker(["exec", id, "psql", "-X", "-Atq", "-U", "postgres",
    "-d", "postgres", "-c", "SELECT system_identifier::text FROM pg_control_system()"]);
  if (inside !== system) throw new Error("Issue463 container system identity mismatch.");

  const client = new Client({
    connectionString: migration.toString(), connectionTimeoutMillis: 4_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query<DatabaseIdentity>(`SELECT
      current_database() AS database,current_user AS principal,session_user AS login,
      current_setting('server_version_num') AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS system_id,
      pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) AS database_owner,
      rolsuper AS superuser,rolinherit AS inherit,rolreplication AS replication,
      rolbypassrls AS bypassrls,rolcreaterole AS createrole,rolcreatedb AS createdb
      FROM pg_roles WHERE rolname=current_user`);
    const row = rows[0];
    if (rows.length !== 1 || row?.database !== database ||
        row.principal !== migration.username || row.login !== migration.username ||
        row.database_owner !== migration.username || !/^17\d{4}$/.test(row.version) ||
        row.system_id !== system || row.superuser || row.inherit || row.replication ||
        row.bypassrls || !row.createrole || !row.createdb) {
      throw new Error("Issue463 connected PostgreSQL identity mismatch.");
    }
    const lease = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(463,7) AS acquired");
    if (lease.rows[0]?.acquired !== true) {
      throw new Error("Issue463 disposable fixture already leased.");
    }
    const migrations = await assertMigrationHistory(client);
    await assertRuntime(runtime);
    return { client, candidate, id, owner, database, system, port, migrations,
      approverUrl: urls[5]!.toString(), executorUrl: urls[6]!.toString(),
      async close() { await client.end(); } };
  } catch (error) {
    await client.end();
    throw error;
  }
}
