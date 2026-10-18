import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  linkSync, lstatSync, readFileSync, realpathSync,
  statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, parse, resolve, sep } from "node:path";
import process from "node:process";

const comparePath = (value) =>
  process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);

/** Refuse symlinked Windows junctions, reparse parents and redirected task-owned data. */
export function assertCanonicalOwnedDirectory(directory) {
  assert(isAbsolute(directory), "V2_FIXTURE_OWNED_PATH_NOT_ABSOLUTE");
  const absolute = resolve(directory);
  let cursor = parse(absolute).root;
  for (const segment of absolute.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    const entry = lstatSync(cursor);
    assert(!entry.isSymbolicLink() && entry.isDirectory(),
      "V2_FIXTURE_OWNED_PARENT_REPARSE_DENIED");
    const physical = realpathSync.native(cursor);
    if (comparePath(physical) !== comparePath(cursor)) {
      // Windows can expand a DOS 8.3 ancestor (ADMINI~1 -> Administrator).
      // Require the short alias to reference precisely the same file identity.
      const isShortAlias = process.platform === "win32" && /~[0-9]+(?:\\|$)/i.test(cursor);
      const followed = statSync(cursor);
      assert(isShortAlias && followed.dev === entry.dev && followed.ino === entry.ino,
        "V2_FIXTURE_OWNED_PARENT_REDIRECT_DENIED");
    }
  }
}

export function readCanonicalManifest(path, owned) {
  assertCanonicalOwnedDirectory(owned);
  assert.equal(comparePath(dirname(resolve(path))), comparePath(resolve(owned)),
    "V2_FIXTURE_MANIFEST_OUTSIDE_OWNED");
  const meta = lstatSync(path);
  assert(meta.isFile() && !meta.isSymbolicLink() && meta.nlink === 1 &&
    meta.size > 0 && meta.size <= 32768, "V2_FIXTURE_MANIFEST_FILE_UNTRUSTED");
  if (comparePath(realpathSync.native(path)) !== comparePath(resolve(path))) {
    const followed = statSync(path);
    assert(process.platform === "win32" && /~[0-9]+(?:\\|$)/i.test(path) &&
      followed.dev === meta.dev && followed.ino === meta.ino,
    "V2_FIXTURE_MANIFEST_REPARSE_DENIED");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const orgNames = (plan) => new Map([
  [plan.mainOrganizationId, "Issue300 V2 TEST main"],
  [plan.foreignOrganizationId, "Issue300 V2 TEST foreign"],
]);
const locNames = (plan) => new Map([
  [plan.locationIds[0], ["Issue300 V2 TEST A", "ISSUE300-V2-A", plan.mainOrganizationId]],
  [plan.locationIds[1], ["Issue300 V2 TEST B", "ISSUE300-V2-B", plan.mainOrganizationId]],
  [plan.foreignLocationId, ["Issue300 V2 TEST foreign", "ISSUE300-V2-FOREIGN", plan.foreignOrganizationId]],
]);

/** Exact semantic row identity: a matching UUID alone is not a valid recovery. */
export function verifyExactFixtureRows(plan, organizations, locations, subscriptions) {
  const expectedOrg = orgNames(plan);
  const expectedLoc = locNames(plan);
  assert(organizations.length === 2 &&
    new Set(organizations.map((row) => row.id)).size === 2 &&
    organizations.every((row) => row.name === expectedOrg.get(row.id) &&
      row.status === "ACTIVE" && row.timezone === "Asia/Amman"),
  "V2_FIXTURE_BAD_ORGANIZATION_READBACK");
  assert(locations.length === 3 &&
    new Set(locations.map((row) => row.id)).size === 3 &&
    locations.every((row) => {
      const expected = expectedLoc.get(row.id);
      return expected && row.name === expected[0] && row.code === expected[1] &&
        row.organization_id === expected[2] && row.status === "ACTIVE" &&
        row.accepting_intake === true && row.currency === "JOD" &&
        row.timezone === "Asia/Amman" && row.address_text === "Isolated synthetic fixture";
    }), "V2_FIXTURE_BAD_LOCATION_READBACK");
  assert(subscriptions.length === 2 &&
    new Set(subscriptions.map((row) => row.organization_id)).size === 2 &&
    subscriptions.every((row) =>
      expectedOrg.has(row.organization_id) &&
      row.plan_code === "ISSUE300_V2_TEST" && row.status === "ACTIVE" &&
      row.dashboard_access_enabled === true &&
      row.report_exports_enabled === false &&
      row.basic_branding_enabled === false),
  "V2_FIXTURE_BAD_SUBSCRIPTION_READBACK");
}

/** Exact V2 role/lease/postmaster and complete 96 migrations, without mutations. */
export async function verifyRecoveryOwner(client, exact, manifest, source, verifyLedger) {
  const identity = (await client.query(
    "SELECT current_database() AS db,current_user AS role,session_user AS login,current_setting('server_version_num')::int AS version,pg_postmaster_start_time() AS started",
  )).rows[0];
  assert(identity?.db === exact.database && identity.role === exact.migrationRole &&
    identity.login === exact.migrationRole && identity.version === exact.serverVersionNum &&
    new Date(identity.started).toISOString() === new Date(manifest.postgresStartedAt).toISOString(),
  "V2_FIXTURE_WRONG_DB_IDENTITY");
  const ledger = (await client.query(
    "SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations",
  )).rows;
  verifyLedger(ledger, manifest, source);
}

/** Recovery never INSERTs/UPSERTs. It can only certify already committed exact rows. */
export async function recoverCommittedPrerequisites({ client, exact, manifest, source, verifyLedger, readback, plan }) {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '4000ms'");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    await verifyRecoveryOwner(client, exact, manifest, source, verifyLedger);
    const rows = await readback(client, plan);
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/** Stage complete bytes then hard-link atomically at a write-once receipt path. */
export function writeUniqueReceipt(path, owned, contents) {
  assertCanonicalOwnedDirectory(owned);
  assert.equal(comparePath(dirname(resolve(path))), comparePath(resolve(owned)),
    "V2_FIXTURE_RECEIPT_OUTSIDE_OWNED");
  assert(basename(path).startsWith("W10_ORG_LOCATION_RECEIPT_") && basename(path).endsWith(".json"),
    "V2_FIXTURE_RECEIPT_NAME_DENIED");
  const staged = join(owned, ".W10_ORG_LOCATION_RECEIPT_STAGE_" + randomUUID());
  writeFileSync(staged, JSON.stringify(contents, null, 2), { flag: "wx", mode: 0o600 });
  try {
    assertCanonicalOwnedDirectory(owned);
    // Same filesystem: linkSync refuses collision and cannot expose partial JSON.
    linkSync(staged, path);
  } finally {
    unlinkSync(staged);
  }
}
