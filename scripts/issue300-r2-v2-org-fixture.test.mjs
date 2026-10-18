import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { validateTarget, verifyDocker, fixturePlan, verifyReadback, verifyLedger, sourceLedger, provisionPrerequisites } from "./issue300-r2-v2-org-fixture.mjs";

const head = "a".repeat(40);
const lease = "issue300-r2-w7-org-prereq-20261018";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const manifest = {
  host: "127.0.0.1",
  port: 58387,
  database: "issue300_r2_w7_acceptance_v2",
  migrationRole: "issue300_r2_w7_owner_v2",
  runtimeRole: "issue300_r2_w7_runtime_v2",
  containerName: "issue300_r2_w7_acceptance_v2_pg17",
  containerLabel: "issue300-r2-w7-acceptance-v2",
  volume: "issue300_r2_w7_acceptance_v2_pgdata",
  serverVersionNum: 170010,
  containerId: "d".repeat(64),
  apiBundleSha256: "e".repeat(64),
  candidateSha: head,
  leaseId: lease,
  postgresStartedAt: "2026-10-18T18:00:00.000Z",
  migrationChecksums: Object.fromEntries(Array.from({ length: 96 }, (_, i) => ["2026101800" + String(i).padStart(4, "0") + "_fixture", hash(String(i))])),
};
const env = {
  NODE_ENV: "test",
  ISSUE300_R2_V2_ORG_FIXTURE_ENABLE: "ISSUE_EXACT_V2",
  ISSUE300_R2_CANDIDATE_SHA: head,
  ISSUE300_R2_PROOF_LEASE_ID: lease,
  ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL: "postgresql://issue300_r2_w7_owner_v2:synthetic@127.0.0.1:58387/issue300_r2_w7_acceptance_v2",
};
const params = () => ({ env, candidateSha: head, clean: true, manifest });
const denied = (fn) => assert.throws(fn);

test("V2 only: test environment, clean SHA, pinned role/DB/lease and source manifest", () => {
  assert.equal(validateTarget(params()).leaseId, lease);
  denied(() => validateTarget({ ...params(), clean: false }));
  denied(() => validateTarget({ ...params(), candidateSha: "f".repeat(40) }));
  denied(() => validateTarget({ ...params(), env: { ...env, NODE_ENV: "production" } }));
  denied(() => validateTarget({ ...params(), env: { ...env, ISSUE300_R2_PROOF_LEASE_ID: "foreign" } }));
  denied(() => validateTarget({ ...params(), env: { ...env, ISSUE300_R2_V2_ORG_FIXTURE_ENABLE: "1" } }));
  for (const [name, value] of [
    ["port", 57285],
    ["database", "issue300_r2"],
    ["runtimeRole", "postgres"],
    ["containerLabel", "human"],
    ["volume", "wrong"],
    ["serverVersionNum", 160000],
    ["containerId", "not-an-id"],
    ["candidateSha", "f".repeat(40)],
  ])
    denied(() => validateTarget({ ...params(), manifest: { ...manifest, [name]: value } }));
  for (const url of [
    env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL.replace("58387", "57285"),
    env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL.replace("127.0.0.1", "localhost"),
    env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL.replace("owner_v2", "runtime_v2"),
    env.ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL + "?sslmode=disable",
    "https://127.0.0.1:58387/issue300_r2_w7_acceptance_v2",
  ])
    denied(() =>
      validateTarget({
        ...params(),
        env: {
          ...env,
          ISSUE300_R2_OWNED_MIGRATION_DATABASE_URL: url,
        },
      }),
    );
});

const docker = () => ({
  Id: manifest.containerId,
  Name: "/" + manifest.containerName,
  State: { Running: true },
  Config: { Labels: { "com.vaylet.task": manifest.containerLabel } },
  NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58387" }] } },
  Mounts: [{ Type: "volume", Name: manifest.volume, Destination: "/var/lib/postgresql/data" }],
});
test("Docker ID, label, single loopback 58387 bind and exact owned volume", () => {
  assert.doesNotThrow(() => verifyDocker(manifest, docker()));
  for (const change of [
    { Id: "f".repeat(64) },
    { Name: "/human_pg" },
    { State: { Running: false } },
    { Config: { Labels: { "com.vaylet.task": "human" } } },
    { NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58387" }] } } },
    { Mounts: [{ Type: "volume", Name: "foreign", Destination: "/var/lib/postgresql/data" }] },
  ])
    denied(() => verifyDocker(manifest, { ...docker(), ...change }));
});
test("deterministic leased IDs, two owned active Locations, foreign Org/Location and entitlement readback", () => {
  const plan = fixturePlan(head, lease);
  const repeat = fixturePlan(head, lease);
  assert.deepEqual(plan, repeat);
  assert.notDeepEqual(plan, fixturePlan(head, lease + "-other"));
  const orgs = [
    { id: plan.mainOrganizationId, name: "Issue300 V2 TEST main", status: "ACTIVE", timezone: "Asia/Amman" },
    { id: plan.foreignOrganizationId, name: "Issue300 V2 TEST foreign", status: "ACTIVE", timezone: "Asia/Amman" },
  ];
  const locations = [
    ...plan.locationIds.map((id) => ({
      id,
      organization_id: plan.mainOrganizationId,
      status: "ACTIVE",
      accepting_intake: true,
      currency: "JOD",
    })),
    { id: plan.foreignLocationId, organization_id: plan.foreignOrganizationId, status: "ACTIVE", accepting_intake: true, currency: "JOD" },
  ];
  const subscriptions = [plan.mainOrganizationId, plan.foreignOrganizationId].map((id) => ({
    organization_id: id,
    plan_code: "ISSUE300_V2_TEST",
    status: "ACTIVE",
    dashboard_access_enabled: true,
    report_exports_enabled: false,
    basic_branding_enabled: false,
  }));
  assert.doesNotThrow(() => verifyReadback(plan, orgs, locations, subscriptions));
  denied(() => verifyReadback(plan, orgs, [{ ...locations[0], organization_id: plan.foreignOrganizationId }, ...locations.slice(1)], subscriptions));
  denied(() => verifyReadback(plan, orgs, locations, [{ ...subscriptions[0], dashboard_access_enabled: false }, subscriptions[1]]));
  denied(() => verifyReadback(plan, orgs, [{ ...locations[0], status: "INACTIVE" }, ...locations.slice(1)], subscriptions));
  denied(() => verifyReadback(plan, orgs.slice(1), locations, subscriptions));
});
test("all 96 finished checksum identities must equal owner manifest AND immutable source", () => {
  const source = { ...manifest.migrationChecksums };
  const rows = Object.entries(source).map(([migration_name, checksum]) => ({
    migration_name,
    checksum,
    finished_at: new Date(),
    rolled_back_at: null,
  }));
  assert.doesNotThrow(() => verifyLedger(rows, manifest, source));
  denied(() => verifyLedger(rows.slice(1), manifest, source));
  denied(() =>
    verifyLedger(
      rows.map((r, i) => (i === 0 ? { ...r, checksum: "f".repeat(64) } : r)),
      manifest,
      source,
    ),
  );
  denied(() =>
    verifyLedger(rows, manifest, {
      ...source,
      [rows[0].migration_name]: "c".repeat(64),
    }),
  );
  assert.equal(Object.keys(sourceLedger()).length, 96);
});
test("wrong PG identity rejects BEFORE first insert/commit, rolls back, no credential output", async () => {
  const plan = fixturePlan(head, lease);
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT current_database()"))
        return {
          rows: [
            {
              db: "human_database",
              role: "postgres",
              login: "postgres",
              version: 170010,
              started: new Date(manifest.postgresStartedAt),
            },
          ],
        };
      return { rows: [] };
    },
  };
  await assert.rejects(
    provisionPrerequisites({
      client,
      plan,
      manifest,
      source: manifest.migrationChecksums,
    }),
    /V2_FIXTURE_WRONG_DB_IDENTITY/,
  );
  assert(calls.includes("ROLLBACK"));
  assert(!calls.some((sql) => /INSERT INTO|COMMIT|DELETE|UPDATE|TRUNCATE|DROP|GRANT/i.test(sql)));
});
test("occupied leased fixture rejects BEFORE insert; never updates an existing row", async () => {
  const plan = fixturePlan(head, lease);
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT current_database()"))
        return {
          rows: [
            {
              db: manifest.database,
              role: manifest.migrationRole,
              login: manifest.migrationRole,
              version: 170010,
              started: new Date(manifest.postgresStartedAt),
            },
          ],
        };
      if (sql.startsWith("SELECT migration_name"))
        return {
          rows: Object.entries(manifest.migrationChecksums).map(([migration_name, checksum]) => ({
            migration_name,
            checksum,
            finished_at: new Date(),
            rolled_back_at: null,
          })),
        };
      if (sql.startsWith("SELECT (SELECT count")) return { rows: [{ total: "1" }] };
      return { rows: [] };
    },
  };
  await assert.rejects(
    provisionPrerequisites({
      client,
      plan,
      manifest,
      source: manifest.migrationChecksums,
    }),
    /V2_FIXTURE_EXISTS_NO_UPSERT/,
  );
  assert(calls.includes("ROLLBACK"));
  assert(!calls.some((sql) => /INSERT INTO|COMMIT|DELETE|UPDATE|TRUNCATE|DROP|GRANT/i.test(sql)));
});
