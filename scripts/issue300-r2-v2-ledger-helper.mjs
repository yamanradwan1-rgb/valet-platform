/* global process */
// TEST-ONLY SQL installer. It never connects to PostgreSQL by itself.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = "issue300_r2_v2_migration_ledger_sha256";
const qualified = `public.${name}()`;
export const v2LedgerTarget = Object.freeze({
  database: "issue300_r2_w7_acceptance_v2",
  host: "127.0.0.1",
  port: 58387,
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  label: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  serverVersionNum: 170010,
});
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const migrationPattern = /^\d{14}_[a-z0-9_]+$/;
const leasePattern = /^issue300-r2-[a-z0-9-]{8,}$/;

export function validateOwnerTarget(urlText, manifest) {
  let url;
  try { url = new URL(urlText ?? ""); }
  catch { throw Error("V2_OWNER_TARGET_DENIED"); }
  assert(url.protocol === "postgresql:" &&
    url.hostname === v2LedgerTarget.host &&
    url.port === String(v2LedgerTarget.port) &&
    url.pathname === `/${v2LedgerTarget.database}` &&
    decodeURIComponent(url.username) === v2LedgerTarget.migrationRole &&
    url.password.length > 0 && !url.search && !url.hash,
  "V2_OWNER_TARGET_DENIED");
  assert(manifest && typeof manifest === "object", "V2_RESOURCE_MANIFEST_MISSING");
  for (const [key, expected] of Object.entries(v2LedgerTarget)) {
    const manifestKey = key === "label" ? "containerLabel" : key;
    assert.equal(manifest[manifestKey], expected, "V2_RESOURCE_TARGET_DENIED");
  }
  assert.match(manifest.containerId ?? "", hashPattern);
  assert.match(manifest.leaseId ?? "", leasePattern);
  assert.match(manifest.candidateSha ?? "", /^[a-f0-9]{40}$/);
  assert(hashPattern.test(manifest.apiBundleSha256 ?? ""));
  assert(Number.isFinite(Date.parse(manifest.postgresStartedAt)));
  return url.href;
}

export function expectedLedgerFromSource(directory = join(root, "packages/database/prisma/migrations")) {
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(names.length, 96, "V2_REQUIRES_EXACTLY_96_SOURCE_MIGRATIONS");
  assert(names.every((value) => migrationPattern.test(value)));
  return Object.fromEntries(names.sort().map((migration) => [
    migration, sha(readFileSync(join(directory, migration, "migration.sql"))),
  ]));
}

export function expectedLedgerDigest(checksums) {
  const pairs = Object.entries(checksums ?? {});
  assert.equal(pairs.length, 96, "V2_REQUIRES_EXACTLY_96_MIGRATIONS");
  assert(pairs.every(([entry, hash]) =>
    migrationPattern.test(entry) && hashPattern.test(hash)));
  return sha(pairs.sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([entry, hash]) => `${entry}:${hash}`).join("\n"));
}

/** Helper embeds all 96 source checksum pairs; its body must also be signed
 * and rechecked LIVE by Prime's runtime guard, not merely its function OID. */
export function buildV2HelperSql(checksums) {
  const expected = expectedLedgerDigest(checksums);
  const rows = Object.entries(checksums).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([entry, hash]) => `      ('${entry}', '${hash}')`).join(",\n");
  const ddl = `CREATE FUNCTION public.${name}()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $issue300_r2_v2_ledger$
  WITH expected(migration_name, checksum) AS (
    VALUES
${rows}
  ),
  actual AS MATERIALIZED (
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM public._prisma_migrations
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM expected) = 96
     AND (SELECT count(*) FROM actual) = 96
     AND NOT EXISTS (
       SELECT 1 FROM actual a FULL JOIN expected e
         ON a.migration_name = e.migration_name
       WHERE a.migration_name IS NULL OR e.migration_name IS NULL
          OR a.checksum IS DISTINCT FROM e.checksum
          OR a.finished_at IS NULL OR a.rolled_back_at IS NOT NULL
     )
    THEN (
      SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.string_agg(migration_name || ':' || checksum,
          pg_catalog.chr(10) ORDER BY migration_name COLLATE "C"), 'UTF8'
      )), 'hex') FROM actual
    )
    ELSE NULL
  END
$issue300_r2_v2_ledger$`;
  const acl = [
    `REVOKE ALL ON FUNCTION ${qualified} FROM PUBLIC`,
    `GRANT EXECUTE ON FUNCTION ${qualified} TO ${v2LedgerTarget.runtimeRole}`,
  ];
  return Object.freeze({ ddl, acl, expectedDigest: expected,
    readSql: `SELECT ${qualified} AS digest`,
    fingerprintSql: `SELECT pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(pg_catalog.pg_get_functiondef('${qualified}'::regprocedure),
        'UTF8')), 'hex') AS fingerprint` });
}

export function verifyOwnedDocker(manifest, docker) {
  const publish = docker?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert(docker?.Id === manifest.containerId &&
    docker?.Name === `/${v2LedgerTarget.containerName}` &&
    docker?.State?.Running === true &&
    docker?.Config?.Labels?.["com.vaylet.task"] === v2LedgerTarget.label &&
    publish.length === 1 && publish[0].HostIp === v2LedgerTarget.host &&
    publish[0].HostPort === String(v2LedgerTarget.port) &&
    Object.keys(docker.NetworkSettings.Ports).length === 1 &&
    docker?.Mounts?.filter((m) => m.Type === "volume").length === 1 &&
    docker?.Mounts?.some((m) => m.Type === "volume" &&
      m.Name === v2LedgerTarget.volume &&
      m.Destination === "/var/lib/postgresql/data"),
  "V2_DOCKER_OWNERSHIP_DENIED");
}

export function assertV2Preflight(identity, privileges) {
  assert(identity?.database === v2LedgerTarget.database &&
    identity?.user === v2LedgerTarget.migrationRole &&
    identity?.login === v2LedgerTarget.migrationRole &&
    Number(identity?.version) === v2LedgerTarget.serverVersionNum &&
    identity?.replica === false, "V2_DB_OWNER_IDENTITY_DENIED");
  assert(privileges?.ownerSelect === true && privileges?.runtimeSelect === false &&
    privileges?.runtimeInsert === false && privileges?.runtimeUpdate === false &&
    privileges?.runtimeDelete === false && privileges?.runtimeTrigger === false &&
    privileges?.runtimeTruncate === false &&
    privileges?.runtimeCreate === false && privileges?.runtimeElevated === false &&
    privileges?.runtimeAnyTrigger === false &&
    privileges?.runtimeGuardFunctionExecute === false &&
    privileges?.ownerCreate === true, "V2_RUNTIME_LEDGER_ACL_DENIED");
}

/** Reject an accidentally supplied human/shared pg.Client BEFORE its first
 * SQL statement. SQL identity checks remain mandatory after connecting. */
export function assertOwnedClient(admin) {
  const connection = admin?.connectionParameters;
  assert(connection?.host === v2LedgerTarget.host &&
    Number(connection?.port) === v2LedgerTarget.port &&
    connection?.database === v2LedgerTarget.database &&
    connection?.user === v2LedgerTarget.migrationRole,
  "V2_ADMIN_CLIENT_IS_NOT_OWNED_TARGET");
}

/** Prime must compare these against freshly read values on EVERY admitted
 * R2 request; a previously signed certificate alone is not live evidence. */
export function verifyV2LiveLedgerEvidence({
  liveDigest, signedDigest, liveFunctionFingerprint, signedFunctionFingerprint,
  runtimeLedgerSelect,
}) {
  return runtimeLedgerSelect === false &&
    hashPattern.test(signedDigest ?? "") &&
    hashPattern.test(signedFunctionFingerprint ?? "") &&
    liveDigest === signedDigest &&
    liveFunctionFingerprint === signedFunctionFingerprint;
}

/** Injectable client, but only an owner-authenticated, explicitly leased V2
 * conductor may call it. No connection or secret handling is implemented here. */
export async function installOwnedV2LedgerHelper({
  admin, ownerDatabaseUrl, manifest, env = process.env,
}) {
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.ISSUE300_R2_V2_LEDGER_HELPER_ENABLE, "INSTALL_EXACT_OWNED_V2");
  validateOwnerTarget(ownerDatabaseUrl, manifest);
  assertOwnedClient(admin);
  assert.equal(env.ISSUE300_R2_PROOF_LEASE_ID, manifest.leaseId);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  }).trim(), manifest.candidateSha);
  assert.equal(execFileSync("git", ["status", "--porcelain=v1"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  }).trim(), "", "V2_HELPER_REQUIRES_CLEAN_SIGNED_SOURCE");
  const docker = JSON.parse(execFileSync("docker",
    ["inspect", v2LedgerTarget.containerName],
    { encoding: "utf8", windowsHide: true }))[0];
  verifyOwnedDocker(manifest, docker);
  const checksums = expectedLedgerFromSource();
  assert.equal(expectedLedgerDigest(checksums),
    expectedLedgerDigest(manifest.migrationChecksums));
  const plan = buildV2HelperSql(checksums);
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL statement_timeout = '3000ms'");
    await admin.query("SET LOCAL lock_timeout = '500ms'");
    const identity = (await admin.query(`SELECT current_database() AS database,
      current_user AS "user", session_user AS login,
      current_setting('server_version_num')::int AS version,
      pg_is_in_recovery() AS replica, pg_postmaster_start_time() AS started`)).rows[0];
    assert(identity?.database === v2LedgerTarget.database &&
      identity?.user === v2LedgerTarget.migrationRole &&
      identity?.login === v2LedgerTarget.migrationRole &&
      Number(identity?.version) === v2LedgerTarget.serverVersionNum &&
      identity?.replica === false, "V2_DB_OWNER_IDENTITY_DENIED");
    // Lock only AFTER database identity is confirmed; never lock a human DB.
    await admin.query("LOCK TABLE public._prisma_migrations IN SHARE MODE");
    const privileges = (await admin.query(`SELECT
      has_table_privilege(current_user,'public._prisma_migrations','SELECT') AS "ownerSelect",
      has_schema_privilege(current_user,'public','CREATE') AS "ownerCreate",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','SELECT') AS "runtimeSelect",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','INSERT') AS "runtimeInsert",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','UPDATE') AS "runtimeUpdate",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','DELETE') AS "runtimeDelete",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','TRIGGER') AS "runtimeTrigger",
      has_table_privilege('${v2LedgerTarget.runtimeRole}','public._prisma_migrations','TRUNCATE') AS "runtimeTruncate",
      has_schema_privilege('${v2LedgerTarget.runtimeRole}','public','CREATE') AS "runtimeCreate",
      EXISTS (SELECT 1 FROM unnest(ARRAY[
        'tasks','incidents','audit_events','valet_sessions',
        'key_custody_events','dispatch_events']) AS tables(name)
        WHERE has_table_privilege('${v2LedgerTarget.runtimeRole}',
          'public.' || tables.name, 'TRIGGER')) AS "runtimeAnyTrigger",
      (has_function_privilege('${v2LedgerTarget.runtimeRole}',
          'public.management_pagination_preserve_birth_xid()', 'EXECUTE') OR
       has_function_privilege('${v2LedgerTarget.runtimeRole}',
          'public.issue300_prevent_relation_rewrite()', 'EXECUTE') OR
       has_function_privilege('${v2LedgerTarget.runtimeRole}',
          'public.issue300_prevent_attribution_rewrite()', 'EXECUTE'))
          AS "runtimeGuardFunctionExecute",
      (SELECT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR
        r.rolreplication OR r.rolbypassrls OR r.rolinherit OR EXISTS (
          SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))
        FROM pg_roles r WHERE r.rolname='${v2LedgerTarget.runtimeRole}') AS "runtimeElevated"`)).rows[0];
    assertV2Preflight(identity, privileges);
    assert.equal(new Date(identity.started).toISOString(),
      new Date(manifest.postgresStartedAt).toISOString(), "V2_POSTMASTER_RESTART_DENIED");
    const rows = (await admin.query(`SELECT migration_name, checksum,
      finished_at, rolled_back_at FROM public._prisma_migrations`)).rows;
    assert.equal(rows.length, 96, "V2_LEDGER_COUNT_MISMATCH");
    assert(rows.every((row) => row.finished_at && !row.rolled_back_at &&
      checksums[row.migration_name] === row.checksum), "V2_LEDGER_MISMATCH");
    // CREATE, never CREATE OR REPLACE: an existing/tampered helper blocks install.
    await admin.query(plan.ddl);
    for (const statement of plan.acl) await admin.query(statement);
    const result = (await admin.query(plan.readSql)).rows[0]?.digest;
    assert.equal(result, plan.expectedDigest, "V2_LEDGER_HELPER_INTEGRITY_DENIED");
    const acl = (await admin.query(`SELECT
      NOT has_table_privilege('${v2LedgerTarget.runtimeRole}',
        'public._prisma_migrations','SELECT') AS denied,
      NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        p.proacl, pg_catalog.acldefault('f',p.proowner))) ace
        WHERE ace.grantee=0 AND ace.privilege_type='EXECUTE') AS no_public,
      has_function_privilege('${v2LedgerTarget.runtimeRole}',
        '${qualified}', 'EXECUTE') AS runtime_exec,
      p.prosecdef AS definer, owner.rolname AS owner
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE p.oid='${qualified}'::regprocedure`)).rows[0];
    assert(acl?.denied && acl?.no_public && acl?.runtime_exec &&
      acl?.definer && acl?.owner === v2LedgerTarget.migrationRole,
    "V2_HELPER_SECURITY_ACL_DENIED");
    const fingerprint = (await admin.query(plan.fingerprintSql)).rows[0]?.fingerprint;
    assert.match(fingerprint ?? "", hashPattern);
    await admin.query("COMMIT");
    return Object.freeze({ ledgerDigest: result, functionFingerprintSha256: fingerprint });
  } catch (error) {
    await admin.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
