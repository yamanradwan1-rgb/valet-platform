import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  readCanonicalManifest, recoverCommittedPrerequisites, writeUniqueReceipt,
  verifyExactFixtureRows,
} from "./issue300-r2-v2-org-fixture-recovery.mjs";
import { fixturePlan, verifyLedger } from "./issue300-r2-v2-org-fixture.mjs";

const sha = "e".repeat(40);
const lease = "issue300-r2-w7-owned-recovery-test";
const plan = fixturePlan(sha, lease);
const checksum = "f".repeat(64);
const checksums = Object.fromEntries(Array.from({ length: 96 }, (_, i) =>
  ["2026101800" + String(i).padStart(4, "0") + "_mock", checksum]));
const manifest = {
  postgresStartedAt: "2026-10-18T18:00:00.000Z",
  migrationChecksums: checksums,
};
const exact = {
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  serverVersionNum: 170010,
};
const migrationRows = Object.entries(checksums).map(([migration_name, sum]) => ({
  migration_name, checksum: sum, finished_at: new Date(), rolled_back_at: null,
}));
function fixtureRows() {
  return {
    organizations: [
      { id: plan.mainOrganizationId, name: "Issue300 V2 TEST main", status: "ACTIVE", timezone: "Asia/Amman" },
      { id: plan.foreignOrganizationId, name: "Issue300 V2 TEST foreign", status: "ACTIVE", timezone: "Asia/Amman" },
    ],
    locations: [
      ...plan.locationIds.map((id, i) => ({
        id, organization_id: plan.mainOrganizationId,
        name: i ? "Issue300 V2 TEST B" : "Issue300 V2 TEST A",
        code: i ? "ISSUE300-V2-B" : "ISSUE300-V2-A",
        timezone: "Asia/Amman", address_text: "Isolated synthetic fixture",
        status: "ACTIVE", accepting_intake: true, currency: "JOD",
      })),
      {
        id: plan.foreignLocationId, organization_id: plan.foreignOrganizationId,
        name: "Issue300 V2 TEST foreign", code: "ISSUE300-V2-FOREIGN",
        timezone: "Asia/Amman", address_text: "Isolated synthetic fixture",
        status: "ACTIVE", accepting_intake: true, currency: "JOD",
      },
    ],
    subscriptions: [plan.mainOrganizationId, plan.foreignOrganizationId].map((organization_id) => ({
      organization_id, plan_code: "ISSUE300_V2_TEST", status: "ACTIVE",
      dashboard_access_enabled: true, report_exports_enabled: false,
      basic_branding_enabled: false,
    })),
  };
}
function stubDatabase({ badIdentity = false, badLedger = false } = {}) {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith("SELECT current_database()")) return { rows: [{
      db: badIdentity ? "human" : exact.database,
      role: exact.migrationRole, login: exact.migrationRole,
      version: 170010, started: new Date(manifest.postgresStartedAt),
    }] };
    if (sql.startsWith("SELECT migration_name")) return {
      rows: badLedger ? [{ ...migrationRows[0], checksum: "0".repeat(64) }, ...migrationRows.slice(1)] : migrationRows,
    };
    return { rows: [] };
  } };
  return { client, calls };
}
const recover = (client, readback) =>
  recoverCommittedPrerequisites({
    client, exact, manifest, source: checksums, verifyLedger, plan, readback,
  });

test("crash-after-COMMIT: read-only recover certifies exact already-committed fixture", async () => {
  const { client, calls } = stubDatabase();
  let readbacks = 0;
  const witness = fixtureRows();
  const result = await recover(client, async () => {
    readbacks++;
    verifyExactFixtureRows(plan, witness.organizations, witness.locations, witness.subscriptions);
    return witness;
  });
  assert.deepEqual(result, witness);
  assert.equal(readbacks, 1);
  assert.deepEqual(calls.slice(0, 2), ["BEGIN READ ONLY", "SET LOCAL statement_timeout = '4000ms'"]);
  assert.equal(calls.at(-1), "COMMIT");
  assert(calls.every((sql) => !/INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|GRANT|CREATE/i.test(sql)));
});

test("wrong DB identity fails closed before ledger or receipt, without DML", async () => {
  const { client, calls } = stubDatabase({ badIdentity: true });
  await assert.rejects(recover(client, async () => {
    throw Error("Readback must never run");
  }), /V2_FIXTURE_WRONG_DB_IDENTITY/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert(!calls.some((sql) => sql.startsWith("SELECT migration_name")));
  assert(!calls.some((sql) => /INSERT INTO|UPDATE public|DELETE FROM/i.test(sql)));
});

test("96-row ledger drift cannot create a recovery receipt", async () => {
  const { client, calls } = stubDatabase({ badLedger: true });
  await assert.rejects(recover(client, async () => {
    throw Error("Readback must never run");
  }), /V2_FIXTURE_LEDGER_CHECKSUM/);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("wrong committed exact UUID row content rejects recovery", async () => {
  const { client, calls } = stubDatabase();
  const rows = fixtureRows();
  rows.locations[1].code = "REASSIGNED";
  await assert.rejects(recover(client, async () => {
    verifyExactFixtureRows(plan, rows.organizations, rows.locations, rows.subscriptions);
  }), /V2_FIXTURE_BAD_LOCATION_READBACK/);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("receipt creates atomic complete bytes exactly once; existing receipt never overwritten", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "issue300-v2-recovery-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const owned = join(workspace, "owned");
  mkdirSync(owned);
  const receipt = join(owned, "W10_ORG_LOCATION_RECEIPT_fixture.json");
  writeUniqueReceipt(receipt, owned, { status: "verified", count: 7 });
  assert.deepEqual(JSON.parse(readFileSync(receipt, "utf8")), { status: "verified", count: 7 });
  assert.throws(() => writeUniqueReceipt(receipt, owned, { status: "forged" }));
  assert.equal(JSON.parse(readFileSync(receipt, "utf8")).status, "verified");
  const manifestPath = join(owned, "R2_OWNED_RESOURCE_MANIFEST.json");
  writeFileSync(manifestPath, '{"candidate":"signed-source"}');
  assert.equal(readCanonicalManifest(manifestPath, owned).candidate, "signed-source");
});

test("Windows junction/redirected owned directory cannot redirect manifest or receipt", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "issue300-v2-junction-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const actual = join(workspace, "real");
  const link = join(workspace, "redirect");
  mkdirSync(actual);
  writeFileSync(join(actual, "R2_OWNED_RESOURCE_MANIFEST.json"), '{"candidate":"untrusted"}');
  try {
    symlinkSync(actual, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.diagnostic("OS denied creating a symlink/junction fixture");
      return;
    }
    throw error;
  }
  assert.throws(() => readCanonicalManifest(join(link, "R2_OWNED_RESOURCE_MANIFEST.json"), link));
  assert.throws(() => writeUniqueReceipt(join(link, "W10_ORG_LOCATION_RECEIPT_fixture.json"), link, {}));
});
