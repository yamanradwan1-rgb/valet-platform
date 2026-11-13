import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { preflightIssue416Target } from "../issue416-private/target-preflight.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");
const scopes = ["target", "issuer", "organization", "client"];
const caps = [3, 20, 100, 30];

async function attestedClient(urlKey) {
  // W9's global setup already holds the isolated exclusive lease.
  // Recheck real Docker + SQL target identity before every connection.
  await preflightIssue416Target();
  const client = new Client({
    connectionString: process.env[urlKey], connectionTimeoutMillis: 3000,
  });
  await client.connect();
  return client;
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest();
}

function hash(value) {
  return `anti-abuse-hmac-sha256:v1:${fingerprint(value).toString("hex")}`;
}

function identities() {
  return [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
}

async function reserve(client, operationId, actorIds, keys, marker) {
  const result = await client.query(`
    SELECT bundle_state,reservation_ids
    FROM auth_proof_private.reserve_reset_issue_quota(
      $1::text,$2::uuid,$3::bytea,$4::uuid,$5::uuid,
      $6::uuid,$7::uuid,$8::uuid,$9::text,$10::text,$11::text,$12::text
    )`, ["issue416-w9", operationId, fingerprint(marker), ...actorIds, ...keys]);
  return result.rows[0];
}

async function inSyntheticRollback(action) {
  const client = await attestedClient("MIGRATION_DATABASE_URL");
  try {
    await client.query("BEGIN");
    await client.query("SET ROLE vap1_proof_owner");
    try {
      return await action(client);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

describe("Issue416 R02 private PG17 source-gated quota", () => {
  it("denies runtime schema access, key mutation, or quota helper execution", async () => {
    const client = await attestedClient("DATABASE_URL");
    try {
      const access = await client.query(`
        SELECT has_schema_privilege(current_user,'auth_proof_private','USAGE') AS usage,
          has_table_privilege(current_user,
            'auth_proof_private.reset_issue_quota_entries','UPDATE') AS update_row,
          has_table_privilege(current_user,
            'auth_proof_private.reset_issue_quota_bundles','SELECT') AS read_receipt`);
      expect(access.rows[0]).toEqual({
        usage: false, update_row: false, read_receipt: false,
      });
      const fns = await client.query(`
        SELECT p.proname,has_function_privilege(current_user,p.oid,'EXECUTE') AS execute
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='auth_proof_private'
          AND p.proname IN ('reserve_reset_issue_quota','reconcile_reset_issue_quota')`);
      expect(fns.rows).toHaveLength(2);
      expect(fns.rows.every((row) => row.execute === false)).toBe(true);
      await expect(client.query(`SELECT COUNT(*)
        FROM auth_proof_private.reset_issue_quota_entries`))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.end().catch(() => {});
    }
  });

  it("atomically binds four fixed reservations and reuses the exact operation", async () => {
    await inSyntheticRollback(async (client) => {
      const op = randomUUID();
      const ids = identities();
      const keys = scopes.map((scope) => hash(`R02-${op}-${scope}`));
      const first = await reserve(client, op, ids, keys, "fixed-payload");
      expect(first.bundle_state).toBe("PENDING");
      expect(first.reservation_ids).toHaveLength(4);
      expect(new Set(first.reservation_ids).size).toBe(4);
      expect(await reserve(client, op, ids, keys, "fixed-payload")).toEqual(first);
      const rows = await client.query(`SELECT scope,state
        FROM auth_proof_private.reset_issue_quota_entries
        WHERE operation_id=$1 ORDER BY scope COLLATE "C"`, [op]);
      expect(rows.rows).toHaveLength(4);
      expect(rows.rows.every((row) => row.state === "PENDING")).toBe(true);
      // Force the deferred four-row integrity check without COMMIT/fixture residue.
      await client.query("SET CONSTRAINTS auth_proof_private.vap1_reset_bundle_integrity, auth_proof_private.vap1_reset_entry_integrity IMMEDIATE");
      await client.query("SET CONSTRAINTS auth_proof_private.vap1_reset_bundle_integrity, auth_proof_private.vap1_reset_entry_integrity DEFERRED");

      await client.query("SAVEPOINT partial_discount");
      await client.query(`UPDATE auth_proof_private.reset_issue_quota_entries
        SET state='IGNORED' WHERE reservation_id=$1`, [first.reservation_ids[0]]);
      await expect(client.query(
        "SET CONSTRAINTS auth_proof_private.vap1_reset_bundle_integrity, auth_proof_private.vap1_reset_entry_integrity IMMEDIATE",
      )).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT partial_discount");

      await client.query("SAVEPOINT altered_payload");
      await expect(reserve(client, op, ids, keys, "different-payload"))
        .rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT altered_payload");

      const pending = await client.query(
        `SELECT auth_proof_private.reconcile_reset_issue_quota($1,$2) AS state`,
        ["issue416-w9", op],
      );
      expect(pending.rows[0].state).toBe("PENDING");
      const unchanged = await client.query(`SELECT COUNT(*)::int AS count
        FROM auth_proof_private.reset_issue_quota_entries
        WHERE operation_id=$1 AND state='PENDING'`, [op]);
      expect(unchanged.rows[0].count).toBe(4);
    });
  });

  it.each([0, 1, 2, 3])(
    "denies when cap on scope index %i is exhausted, without partial rows",
    async (limited) => {
      await inSyntheticRollback(async (client) => {
        const salt = randomUUID();
        const limitedKey = hash(`shared-${salt}-${scopes[limited]}`);
        const ids = identities();
        for (let i = 0; i < caps[limited]; i += 1) {
          const keys = scopes.map((s, index) =>
            index === limited ? limitedKey : hash(`${salt}-${i}-${s}`));
          const entry = await reserve(client, randomUUID(), ids, keys, `seed-${salt}-${i}`);
          expect(entry.bundle_state).toBe("PENDING");
        }
        const deniedId = randomUUID();
        const deniedKeys = scopes.map((s, index) =>
          index === limited ? limitedKey : hash(`${salt}-denied-${s}`));
        await client.query("SAVEPOINT denied_reserve");
        await expect(reserve(client, deniedId, ids, deniedKeys, `denied-${salt}`))
          .rejects.toMatchObject({ message: expect.stringContaining("QUOTA_EXHAUSTED") });
        await client.query("ROLLBACK TO SAVEPOINT denied_reserve");
        const missing = await client.query(`
          SELECT (SELECT count(*)::int FROM auth_proof_private.reset_issue_quota_bundles
            WHERE operation_id=$1) AS bundles,
            (SELECT count(*)::int FROM auth_proof_private.reset_issue_quota_entries
              WHERE operation_id=$1) AS entries`, [deniedId]);
        expect(missing.rows).toEqual([{ bundles: 0, entries: 0 }]);
      });
    },
  );
});
