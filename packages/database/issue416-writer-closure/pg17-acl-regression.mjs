#!/usr/bin/env node
// Real PG17 tests ONLY in a separately owner-attested W26 disposable fixture.
// --probe is read-only; --repeat-cutover permanently retires test fixture ACLs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import process from "node:process";
import { loadCatalog } from "./catalog.mjs";
import { inspectLegacySignatures } from "./legacy-signatures.mjs";
import { observeFamilyPublicSqlAuthority } from "./sql-family-authority.mjs";
import { inspectEffectivePg17Privileges } from "./pg17-effective-privileges.mjs";
import {
  acquireExclusiveOwnedLease,
  releaseExclusiveOwnedLease,
} from "./pg17-exclusive-lease.mjs";
import {
  assertW26Fixture,
  inspectW26Container,
} from "./pg17-fixture-guard.mjs";
import { provisionVap1RestrictedRuntime } from "../scripts/vap1-security-cutover-provision.mjs";
import { assertLegacyRuntimeProvisioningAllowed } from "../scripts/vap1-security-privileges.mjs";
import { assertAntiAbuseAclRetired } from "../scripts/vap1-anti-abuse-closure.mjs";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

async function formatAndExecute(client, format, values) {
  const placeholders = values.map((_, i) => "$" + (i + 2) + "::text");
  const formatted = await client.query(
    "SELECT pg_catalog.format($1, " + placeholders.join(", ") + ") AS sql",
    [format, ...values],
  );
  const sql = formatted.rows[0]?.sql;
  if (typeof sql !== "string") throw new Error("W26_SQL_FORMAT_FAILED");
  await client.query(sql);
}

async function verifyFixtureDb(client, expected) {
  const result = await client.query(
    "SELECT current_database() AS db, current_user AS actor, " +
      "current_setting('server_version_num')::integer AS version, " +
      "pg_catalog.shobj_description(d.oid,'pg_database') AS fixture_marker " +
      "FROM pg_catalog.pg_database d WHERE d.datname=current_database()",
  );
  if (
    result.rowCount !== 1 ||
    result.rows[0].db !== expected.database ||
    result.rows[0].version < 170000 ||
    result.rows[0].version >= 180000 ||
    result.rows[0].fixture_marker !==
      "ISSUE416_W26_DISPOSABLE_ACL:" + expected.containerId
  )
    throw new Error("W26_PG17_DATABASE_OWNER_MARKER_MISMATCH");
  return result.rows[0].actor;
}

async function getBoundary(client) {
  const row = await client.query(
    "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton",
  );
  if (row.rowCount !== 1) throw new Error("W26_PG17_BOUNDARY_NOT_SINGLETON");
  return row.rows[0].phase;
}

async function snapshot(client, role, signatures) {
  const rights = await client.query(
    "SELECT " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','state','UPDATE') AS state_update, " +
      "pg_catalog.has_column_privilege($1,'public.anti_abuse_events','group_key_hash','UPDATE') AS group_update, " +
      "pg_catalog.has_table_privilege($1,'public.anti_abuse_events','INSERT') AS insert_table, " +
      "pg_catalog.has_any_column_privilege($1,'public.anti_abuse_events','INSERT') AS insert_any",
    [role],
  );
  if (rights.rowCount !== 1) throw new Error("W26_PG17_RUNTIME_ACL_UNKNOWN");
  let callable = 0;
  let missing = 0;
  for (const { signature } of signatures) {
    const result = await client.query(
      "SELECT pg_catalog.to_regprocedure($2) IS NOT NULL AS found, " +
        "CASE WHEN pg_catalog.to_regprocedure($2) IS NOT NULL " +
        "THEN pg_catalog.has_function_privilege($1," +
        "pg_catalog.to_regprocedure($2),'EXECUTE') ELSE false END AS allowed",
      [role, signature],
    );
    if (result.rowCount !== 1) throw new Error("W26_PG17_FUNCTION_ACL_UNKNOWN");
    if (!result.rows[0].found) missing++;
    if (result.rows[0].allowed) callable++;
  }
  return {
    antiAbuse: rights.rows[0],
    legacyCallable: callable,
    legacyMissing: missing,
    totalSignatures: signatures.length,
  };
}

async function legacyGuardTwice(client, expectedAllowed) {
  for (let n = 0; n < 2; n++) {
    await client.query("BEGIN");
    try {
      if (expectedAllowed) {
        await assertLegacyRuntimeProvisioningAllowed(client);
      } else {
        await assert.rejects(
          assertLegacyRuntimeProvisioningAllowed(client),
          /legacy runtime provisioner may restore authority/,
        );
      }
    } finally {
      await client.query("ROLLBACK");
    }
  }
}

async function sqlOnlyDiscountDenied(client, runtimeRole) {
  // Exact SQL permission test, without changing data. A successful UPDATE 0
  // proves dangerous authority; 42501 is the required PostgreSQL response.
  await client.query("BEGIN");
  let observed;
  try {
    await client.query("SET LOCAL ROLE " + runtimeRole);
    try {
      await client.query(
        "UPDATE public.anti_abuse_events SET state='IGNORED' WHERE false",
      );
      throw new Error("W26_PG17_SQL_ONLY_DISCOUNT_STILL_ALLOWED");
    } catch (error) {
      if (error.message === "W26_PG17_SQL_ONLY_DISCOUNT_STILL_ALLOWED") {
        throw error;
      }
      if (error.code !== "42501") throw error;
      observed = error.code;
    }
  } finally {
    await client.query("ROLLBACK");
  }
  assert.equal(observed, "42501");
  return observed;
}

export async function runOwnedPg17Fixture(config, inspected, clientFactory) {
  assertW26Fixture(config, inspected, process.env);
  const catalog = loadCatalog(repo);
  const legacy = inspectLegacySignatures(repo);
  if (
    catalog.problems.length ||
    catalog.rows.length !== 35 ||
    legacy.problems.length ||
    legacy.signatures.length !== 27
  )
    throw new Error("W26_PG17_SOURCE_INVENTORY_DRIFT");
  const client = clientFactory(config.url);
  await client.connect();
  let lease = false;
  try {
    const actor = await verifyFixtureDb(client, config);
    if (actor !== config.actor) throw new Error("W26_PG17_UNEXPECTED_OPERATOR");
    lease = await acquireExclusiveOwnedLease(client);
    const phase = await getBoundary(client);
    const before = await snapshot(client, config.role, legacy.signatures);
    const beforeEffective = await inspectEffectivePg17Privileges(
      client,
      config.role,
    );
    const publicFamilyAuthority = await observeFamilyPublicSqlAuthority(
      client,
      config.role,
      catalog,
      legacy,
    );
    if (config.purpose === "PROBE") {
      await legacyGuardTwice(client, phase === "LEGACY_COMPAT");
      return {
        verdict: "OBSERVED_NOT_35_WRITER_CLOSURE",
        postgresMajor: 17,
        families: catalog.rows.length,
        phase,
        legacyGuardRepetitions: 2,
        before,
        beforeEffective,
        publicFamilyAuthority,
        pg17CutoverExecuted: false,
      };
    }
    if (phase !== "DRAINED") {
      throw new Error("W26_PG17_CUTOVER_REQUIRES_DRAINED");
    }
    const runs = [];
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await provisionVap1RestrictedRuntime(
        client,
        formatAndExecute,
        config.role,
      );
      assert.equal(result.phase, "DRAINED");
      assert.equal(result.proofWritersReady, false);
      await assertAntiAbuseAclRetired(client);
      const now = await snapshot(client, config.role, legacy.signatures);
      const afterEffective = await inspectEffectivePg17Privileges(
        client,
        config.role,
      );
      assert.equal(now.antiAbuse.state_update, false);
      assert.equal(now.antiAbuse.group_update, false);
      assert.equal(now.antiAbuse.insert_any, false);
      assert.equal(now.legacyCallable, 0);
      assert.equal(afterEffective.publicAcl.table_writes, 0);
      assert.equal(afterEffective.publicAcl.column_writes, 0);
      assert.equal(afterEffective.ordinary.login_writers, 0);
      assert.equal(afterEffective.membership.outward, 0);
      assert.equal(afterEffective.membership.inbound, 0);
      const sqlState = await sqlOnlyDiscountDenied(client, config.role);
      runs.push({
        index: iteration + 1,
        restricted: true,
        sqlOnlyDiscountSqlState: sqlState,
        afterEffective,
        snapshot: now,
      });
    }
    await legacyGuardTwice(client, false);
    return {
      verdict: "RESTRICTED_ACL_ONLY_NOT_35_WRITER_CLOSURE",
      postgresMajor: 17,
      families: catalog.rows.length,
      phase,
      legacyGuardRepetitions: 2,
      provisionerRuns: runs,
      before,
      beforeEffective,
      publicFamilyAuthority,
      pg17CutoverExecuted: true,
      proofWritersReady: false,
    };
  } finally {
    if (lease) {
      await releaseExclusiveOwnedLease(client).catch(() => undefined);
    }
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const purpose =
      process.argv[2] === "--probe"
        ? "PROBE"
        : process.argv[2] === "--repeat-cutover"
          ? "REPEAT_CUTOVER"
          : null;
    const config = {
      purpose,
      url: process.env.ISSUE416_W26_PG17_URL,
      role: process.env.ISSUE416_W26_RUNTIME_ROLE,
      database: process.env.ISSUE416_W26_DATABASE,
      container: process.env.ISSUE416_W26_CONTAINER,
      containerId: process.env.ISSUE416_W26_CONTAINER_ID,
      actor: process.env.ISSUE416_W26_MIGRATOR_ROLE,
      mutationConsent: process.env.ISSUE416_W26_ALLOW_MUTATION,
    };
    // Inspect before loading a DB client or opening a socket.
    const inspected = inspectW26Container(config.container);
    assertW26Fixture(config, inspected, process.env);
    const dependencyAnchor = process.env.ISSUE416_W26_PG_DRIVER_PACKAGE_JSON;
    if (!dependencyAnchor || !dependencyAnchor.endsWith("package.json")) {
      throw new Error("W26_PG17_PG_DRIVER_ANCHOR_REQUIRED");
    }
    const { Client } = createRequire(resolve(dependencyAnchor))("pg");
    const result = await runOwnedPg17Fixture(
      config,
      inspected,
      (connectionString) => new Client({ connectionString }),
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    // Never return a release/closure-ready exit code.
    process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        verdict: "BLOCKED",
        reason: /^W26_/.test(error.message)
          ? error.message
          : "W26_PG17_FIXTURE_OR_ACL_TEST_FAILED",
        ...(typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
          ? { sqlState: error.code }
          : {}),
      }) + "\n",
    );
    process.exitCode = 2;
  }
}
