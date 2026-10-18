/* global process, console, URL */
// Prime-only Issue300 W7 V2 Org/Location prerequisite. No users, MFA or audit.
// Run only from clean final integrated SHA, after explicit Prime PG lease:
// NODE_ENV=test ISSUE300_R2_V2_ORG_FIXTURE_ENABLE=ISSUE_EXACT_V2
// ISSUE300_R2_CANDIDATE_SHA=(git HEAD) ISSUE300_R2_PROOF_LEASE_ID=(Prime lease)
// ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL=(private owner 127.0.0.1:58387 URL)
// node scripts/issue300-r2-v2-org-fixture.mjs --issue
// Receipt contains main Org, two owned Location IDs and foreign Org/Location.
// Separately use canonical pnpm --filter @valet/api staff:provision with
// --organization-id, --audit-location-id, --location-id (x2 for CA, x1 LM),
// --role ORG_ADMIN or LOCATION_MANAGER, --password-stdin, and true MFA login.
// Explicit non-secret shape (password delivered ONLY via private stdin):
// NODE_ENV=test MIGRATION_DATABASE_URL=(same V2 owner URL)
// pnpm --filter @valet/api staff:provision -- --organization-id (receipt.mainOrganizationId)
//   --audit-location-id (receipt.locationIds[0]) --location-id (receipt.locationIds[0])
//   --location-id (receipt.locationIds[1]) --role ORG_ADMIN --email (fresh CA test email)
//   --operator-ref issue300-v2 --reason "Owned W7 isolated CA test" --password-stdin
// Repeat for separate LM with --role LOCATION_MANAGER, --audit-location-id
// receipt.locationIds[1], and ONLY --location-id receipt.locationIds[1].
// Do not run canonical demo seed or local bootstrap on V2: incompatible/destructive.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owned = join(root, "tmp/issue300-r2-w7-acceptance-v2-owned");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const exact = Object.freeze({
  host: "127.0.0.1",
  port: 58387,
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  serverVersionNum: 170010,
});
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const command = (binary, argv) =>
  execFileSync(binary, argv, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    timeout: 9000,
    maxBuffer: 1024 * 1024,
  }).trim();
const readOwnerManifest = (path) => {
  const s = lstatSync(path);
  assert(s.isFile() && !s.isSymbolicLink() && s.size > 0 && s.size <= 32768, "V2_FIXTURE_MANIFEST_FILE_UNTRUSTED");
  return JSON.parse(readFileSync(path, "utf8"));
};
export function validateTarget({ env, candidateSha, clean, manifest }) {
  assert(
    env.NODE_ENV === "test" &&
      env.ISSUE300_R2_V2_ORG_FIXTURE_ENABLE === "ISSUE_EXACT_V2" &&
      /^[a-f0-9]{40}$/.test(candidateSha) &&
      candidateSha === env.ISSUE300_R2_CANDIDATE_SHA &&
      clean,
    "V2_FIXTURE_CLEAN_FINAL_SHA_REQUIRED",
  );
  const leaseId = env.ISSUE300_R2_PROOF_LEASE_ID;
  assert(
    leasePattern.test(leaseId ?? "") &&
      manifest?.leaseId === leaseId &&
      manifest.candidateSha === candidateSha &&
      shaPattern.test(manifest.containerId ?? "") &&
      Number.isFinite(Date.parse(manifest.postgresStartedAt)),
    "V2_FIXTURE_EXCLUSIVE_LEASE_DENIED",
  );
  for (const [name, value] of Object.entries(exact)) assert.equal(manifest[name], value, "V2_FIXTURE_FOREIGN_" + name);
  assert(Object.keys(manifest.migrationChecksums ?? {}).length === 96 && shaPattern.test(manifest.apiBundleSha256 ?? ""), "V2_FIXTURE_MANIFEST_LEDGER_DENIED");
  const url = new URL(env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL ?? "");
  assert(
    url.protocol === "postgresql:" &&
      url.hostname === exact.host &&
      url.port === String(exact.port) &&
      url.pathname === "/" + exact.database &&
      decodeURIComponent(url.username) === exact.migrationRole &&
      url.password.length > 0 &&
      !url.search &&
      !url.hash,
    "V2_FIXTURE_FOREIGN_DATABASE",
  );
  return { leaseId, url: url.href };
}
export function verifyDocker(manifest, docker) {
  const ports = docker?.NetworkSettings?.Ports;
  assert(
    docker?.Id === manifest.containerId &&
      docker.Name === "/" + exact.containerName &&
      docker.State?.Running === true &&
      docker.Config?.Labels?.["com.vaylet.task"] === exact.containerLabel &&
      Object.keys(ports ?? {}).length === 1 &&
      ports["5432/tcp"]?.length === 1 &&
      ports["5432/tcp"][0].HostIp === exact.host &&
      ports["5432/tcp"][0].HostPort === String(exact.port) &&
      docker.Mounts?.filter((m) => m.Type === "volume" && m.Name === exact.volume && m.Destination === "/var/lib/postgresql/data").length === 1,
    "V2_FIXTURE_DOCKER_OWNERSHIP_DENIED",
  );
}
export function sourceLedger(dir = join(root, "packages/database/prisma/migrations")) {
  const dirs = readdirSync(dir, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => x.name);
  assert(dirs.length === 96 && dirs.every((s) => /^\d{14}_[a-z0-9_]+$/.test(s)), "V2_FIXTURE_SOURCE_MIGRATIONS_DENIED");
  return Object.fromEntries(dirs.map((name) => [name, digest(readFileSync(join(dir, name, "migration.sql")))]));
}
export function verifyLedger(rows, manifest, source) {
  assert(
    rows.length === 96 &&
      Object.keys(source).length === 96 &&
      Object.keys(manifest.migrationChecksums ?? {}).length === 96 &&
      new Set(rows.map((r) => r.migration_name)).size === 96,
    "V2_FIXTURE_LEDGER_COUNT",
  );
  for (const row of rows)
    assert(
      row.finished_at && !row.rolled_back_at && row.checksum === source[row.migration_name] && row.checksum === manifest.migrationChecksums[row.migration_name],
      "V2_FIXTURE_LEDGER_CHECKSUM",
    );
}
const uuid = (candidate, lease, tag) => {
  const s = digest(["issue300-v2-org-prerequisite", candidate, lease, tag].join(":"));
  return s.slice(0, 8) + "-" + s.slice(8, 12) + "-4" + s.slice(13, 16) + "-a" + s.slice(17, 20) + "-" + s.slice(20, 32);
};
export function fixturePlan(candidateSha, leaseId) {
  assert(/^[a-f0-9]{40}$/.test(candidateSha) && leasePattern.test(leaseId), "V2_FIXTURE_SCOPE_UNBOUNDED");
  return {
    mainOrganizationId: uuid(candidateSha, leaseId, "main-org"),
    foreignOrganizationId: uuid(candidateSha, leaseId, "foreign-org"),
    locationIds: [uuid(candidateSha, leaseId, "main-a"), uuid(candidateSha, leaseId, "main-b")],
    foreignLocationId: uuid(candidateSha, leaseId, "foreign-location"),
  };
}
export function verifyReadback(plan, organizations, locations, subscriptions) {
  const orgIds = [plan.mainOrganizationId, plan.foreignOrganizationId];
  const locIds = [...plan.locationIds, plan.foreignLocationId];
  assert(
    organizations.length === 2 &&
      new Set(organizations.map((x) => x.id)).size === 2 &&
      organizations.every((r) => orgIds.includes(r.id) && r.status === "ACTIVE" && r.timezone === "Asia/Amman" && r.name.startsWith("Issue300 V2 TEST ")),
    "V2_FIXTURE_BAD_ORGANIZATION_READBACK",
  );
  assert(
    locations.length === 3 &&
      new Set(locations.map((x) => x.id)).size === 3 &&
      locations.every(
        (r) =>
          locIds.includes(r.id) &&
          r.status === "ACTIVE" &&
          r.accepting_intake === true &&
          r.currency === "JOD" &&
          r.organization_id === (plan.locationIds.includes(r.id) ? plan.mainOrganizationId : plan.foreignOrganizationId),
      ),
    "V2_FIXTURE_BAD_LOCATION_READBACK",
  );
  assert(
    subscriptions.length === 2 &&
      new Set(subscriptions.map((x) => x.organization_id)).size === 2 &&
      subscriptions.every(
        (r) =>
          orgIds.includes(r.organization_id) &&
          r.plan_code === "ISSUE300_V2_TEST" &&
          r.status === "ACTIVE" &&
          r.dashboard_access_enabled === true &&
          r.report_exports_enabled === false &&
          r.basic_branding_enabled === false,
      ),
    "V2_FIXTURE_BAD_SUBSCRIPTION_READBACK",
  );
}
async function readback(client, plan) {
  const orgIds = [plan.mainOrganizationId, plan.foreignOrganizationId];
  const locIds = [...plan.locationIds, plan.foreignLocationId];
  const organizations = (await client.query("SELECT id::text,name,status::text,timezone FROM public.organizations WHERE id=ANY($1::uuid[]) ORDER BY id", [orgIds])).rows;
  const locations = (
    await client.query("SELECT id::text,organization_id::text,status::text,accepting_intake,currency FROM public.locations WHERE id=ANY($1::uuid[]) ORDER BY id", [locIds])
  ).rows;
  const subscriptions = (
    await client.query(
      "SELECT organization_id::text,plan_code,status::text,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled FROM public.organization_subscriptions WHERE organization_id=ANY($1::uuid[]) ORDER BY organization_id",
      [orgIds],
    )
  ).rows;
  verifyReadback(plan, organizations, locations, subscriptions);
  return { organizations, locations, subscriptions };
}
async function insertOnly(client, plan) {
  for (const [id, name] of [
    [plan.mainOrganizationId, "Issue300 V2 TEST main"],
    [plan.foreignOrganizationId, "Issue300 V2 TEST foreign"],
  ])
    await client.query("INSERT INTO public.organizations (id,name,status,timezone,updated_at) VALUES ($1,$2,'ACTIVE','Asia/Amman',transaction_timestamp())", [id, name]);
  for (const [id, org, code, name] of [
    [plan.locationIds[0], plan.mainOrganizationId, "ISSUE300-V2-A", "Issue300 V2 TEST A"],
    [plan.locationIds[1], plan.mainOrganizationId, "ISSUE300-V2-B", "Issue300 V2 TEST B"],
    [plan.foreignLocationId, plan.foreignOrganizationId, "ISSUE300-V2-FOREIGN", "Issue300 V2 TEST foreign"],
  ])
    await client.query(
      "INSERT INTO public.locations (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at) VALUES ($1,$2,$3,$4,'Isolated synthetic fixture','Asia/Amman','JOD','ACTIVE',TRUE,transaction_timestamp())",
      [id, org, name, code],
    );
  for (const id of [plan.mainOrganizationId, plan.foreignOrganizationId])
    await client.query(
      "INSERT INTO public.organization_subscriptions (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled) VALUES ($1,'ISSUE300_V2_TEST','ACTIVE',TRUE,FALSE,FALSE)",
      [id],
    );
}
export async function provisionPrerequisites({ client, plan, manifest, source }) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '4000ms'");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const identity = (
      await client.query(
        "SELECT current_database() AS db,current_user AS role,session_user AS login,current_setting('server_version_num')::int AS version,pg_postmaster_start_time() AS started",
      )
    ).rows[0];
    assert(
      identity?.db === exact.database &&
        identity.role === exact.migrationRole &&
        identity.login === exact.migrationRole &&
        identity.version === 170010 &&
        new Date(identity.started).toISOString() === new Date(manifest.postgresStartedAt).toISOString(),
      "V2_FIXTURE_WRONG_DB_IDENTITY",
    );
    const ledger = (await client.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations")).rows;
    verifyLedger(ledger, manifest, source);
    const orgIds = [plan.mainOrganizationId, plan.foreignOrganizationId];
    const locIds = [...plan.locationIds, plan.foreignLocationId];
    const already = (
      await client.query(
        "SELECT (SELECT count(*) FROM public.organizations WHERE id=ANY($1::uuid[]))+(SELECT count(*) FROM public.locations WHERE id=ANY($2::uuid[]))+(SELECT count(*) FROM public.organization_subscriptions WHERE organization_id=ANY($1::uuid[])) AS total",
        [orgIds, locIds],
      )
    ).rows[0];
    assert(Number(already?.total) === 0, "V2_FIXTURE_EXISTS_NO_UPSERT");
    await insertOnly(client, plan);
    const read = await readback(client, plan);
    await client.query("COMMIT");
    return read;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
async function issue() {
  assert(process.argv.length === 3 && process.argv[2] === "--issue", "Usage: node scripts/issue300-r2-v2-org-fixture.mjs --issue");
  const manifest = readOwnerManifest(join(owned, "R2_OWNED_RESOURCE_MANIFEST.json"));
  const candidateSha = command("git", ["rev-parse", "HEAD"]);
  const { leaseId, url } = validateTarget({ env: process.env, candidateSha, clean: command("git", ["status", "--porcelain=v1"]) === "", manifest });
  const docker = () => JSON.parse(command("docker", ["inspect", exact.containerName]))[0];
  verifyDocker(manifest, docker());
  const source = sourceLedger();
  const plan = fixturePlan(candidateSha, leaseId);
  const { Client } = createRequire(join(root, "apps/api/package.json"))("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const witness = await provisionPrerequisites({ client, plan, manifest, source });
    const verified = await readback(client, plan);
    assert(digest(JSON.stringify(witness)) === digest(JSON.stringify(verified)), "V2_FIXTURE_POSTCOMMIT_READBACK_CHANGED");
    verifyDocker(manifest, docker());
    const receipt = {
      kind: "ISSUE300_V2_ORG_LOCATION_PREREQUISITES_V1",
      candidateSha,
      leaseId,
      containerId: manifest.containerId,
      database: exact.database,
      issuedAt: new Date().toISOString(),
      ...plan,
      organizationCount: 2,
      locationCount: 3,
      subscriptionCount: 2,
      readbackSha256: digest(JSON.stringify(verified)),
      ledgerSha256: digest(
        Object.entries(source)
          .sort(([a], [b]) => a.localeCompare(b, "en"))
          .map(([n, h]) => n + ":" + h)
          .join("\n"),
      ),
    };
    const path = join(owned, "W10_ORG_LOCATION_RECEIPT_" + candidateSha.slice(0, 12) + "_" + leaseId + ".json");
    writeFileSync(path, JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
    console.log("PASS exact V2 bounded Org+2 Locations+foreign Org/Location; receipt=" + path + "; SHA256=" + digest(JSON.stringify(receipt)) + "; no Staff or MFA");
  } finally {
    await client.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await issue();
