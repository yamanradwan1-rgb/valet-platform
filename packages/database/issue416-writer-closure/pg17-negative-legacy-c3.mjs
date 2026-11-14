#!/usr/bin/env node
// A non-destructive SQL-only C3 rejection test in a W26 LEGACY_COMPAT DB.
// This code refuses DDL regardless of the actual boundary result.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  assertW26Fixture,
  inspectW26Container,
} from "./pg17-fixture-guard.mjs";
import {
  acquireExclusiveOwnedLease,
  releaseExclusiveOwnedLease,
} from "./pg17-exclusive-lease.mjs";
import { inspectEffectivePg17Privileges } from "./pg17-effective-privileges.mjs";
import { provisionVap1RestrictedRuntime } from "../scripts/vap1-security-cutover-provision.mjs";

export async function verifyNegativeLegacyC3(config, inspected, clientFactory) {
  assertW26Fixture(config, inspected, process.env);
  if (config.purpose !== "PROBE")
    throw new Error("W26_NEGATIVE_C3_READONLY_ONLY");
  const client = clientFactory(config.url);
  await client.connect();
  let lease = false;
  try {
    const owner = await client.query(
      "SELECT current_database() AS db,current_user AS actor," +
        "pg_catalog.shobj_description(oid,'pg_database') AS marker " +
        "FROM pg_catalog.pg_database WHERE datname=current_database()",
    );
    if (
      owner.rowCount !== 1 ||
      owner.rows[0].db !== config.database ||
      owner.rows[0].actor !== config.actor ||
      owner.rows[0].marker !==
        "ISSUE416_W26_DISPOSABLE_ACL:" + config.containerId
    ) {
      throw new Error("W26_NEGATIVE_C3_DB_NOT_OWNED");
    }
    lease = await acquireExclusiveOwnedLease(client);
    const boundary = await client.query(
      "SELECT phase FROM auth_proof_private.security_boundary WHERE singleton",
    );
    if (boundary.rowCount !== 1 || boundary.rows[0].phase !== "LEGACY_COMPAT") {
      throw new Error("W26_NEGATIVE_C3_REQUIRES_LEGACY_COMPAT");
    }
    const before = await inspectEffectivePg17Privileges(client, config.role);
    if (
      !before.legacyStaffAuthLimiterCompatible ||
      !before.legacyGuestClassifiedLimiterCompatible
    ) {
      throw new Error("W26_NEGATIVE_C3_LEGACY_ALREADY_BROKEN");
    }
    const trace = [];
    const readOnlyDdlFence = {
      async query(sql, params) {
        trace.push(sql);
        if (
          /^\s*(?:GRANT|REVOKE|ALTER|DROP|CREATE|UPDATE|INSERT|DELETE)\b/i.test(
            sql,
          )
        ) {
          throw new Error("W26_NEGATIVE_C3_FORBIDDEN_SQL");
        }
        return client.query(sql, params);
      },
    };
    await assert.rejects(
      provisionVap1RestrictedRuntime(
        readOnlyDdlFence,
        async () => {
          throw new Error("W26_NEGATIVE_C3_FORMATTED_DDL");
        },
        config.role,
      ),
      /requires an independently drained boundary/,
    );
    assert.equal(trace[0], "BEGIN");
    assert.equal(trace.at(-1), "ROLLBACK");
    assert.ok(!trace.includes("COMMIT"));
    const after = await inspectEffectivePg17Privileges(client, config.role);
    assert.deepEqual(after, before);
    return {
      verdict: "NEGATIVE_LEGACY_PHASE_ROLLBACK_ONLY",
      phase: "LEGACY_COMPAT",
      rollbackObserved: true,
      noGrantModification: true,
      sourceWritersClosed: false,
      staffAuthLegacyStillCompatible: after.legacyStaffAuthLimiterCompatible,
      guestLegacyStillCompatible: after.legacyGuestClassifiedLimiterCompatible,
    };
  } finally {
    if (lease) await releaseExclusiveOwnedLease(client).catch(() => undefined);
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const config = {
      purpose: "PROBE",
      role: process.env.ISSUE416_W26_RUNTIME_ROLE,
      database: process.env.ISSUE416_W26_DATABASE,
      container: process.env.ISSUE416_W26_CONTAINER,
      containerId: process.env.ISSUE416_W26_CONTAINER_ID,
      url: process.env.ISSUE416_W26_PG17_URL,
      actor: process.env.ISSUE416_W26_MIGRATOR_ROLE,
    };
    const inspected = inspectW26Container(config.container);
    assertW26Fixture(config, inspected, process.env);
    const anchor = process.env.ISSUE416_W26_PG_DRIVER_PACKAGE_JSON;
    if (!anchor || !anchor.endsWith("package.json")) {
      throw new Error("W26_NEGATIVE_C3_DRIVER_NOT_PINNED");
    }
    const { Client } = createRequire(resolve(anchor))("pg");
    const result = await verifyNegativeLegacyC3(
      config,
      inspected,
      (connectionString) => new Client({ connectionString }),
    );
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = 2; // Never a production acceptance gate.
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        verdict: "BLOCKED",
        reason: /^W26_/.test(error.message)
          ? error.message
          : "W26_NEGATIVE_C3_TEST_FAILED",
      }) + "\n",
    );
    process.exitCode = 2;
  }
}
