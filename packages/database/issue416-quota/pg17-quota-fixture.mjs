import { createHash, createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { preflightIssue416Target } from "../issue416-private/target-preflight.mjs";
import { assertPg17QuotaRelease } from "./pg17-quota-release.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");

export const AUDIENCE = "issue416-w9";
export const ISSUE_SCOPES = Object.freeze([
  ["v1:staff-password-reset-issue-target-user", 3],
  ["v1:staff-password-reset-issue-issuer-user", 20],
  ["v1:staff-password-reset-issue-organization", 100],
  ["v1:staff-password-reset-issue-client-address", 30],
]);
export const REDEEM_SCOPES = Object.freeze([
  ["v1:staff-password-reset-redeem-client-address", 30],
  ["v1:staff-password-reset-redeem-credential", 5],
]);

const required = [
  "20261113011300_", "20261113011800_", "20261113011900_",
  "20261113012000_", "20261113012100_", "20261113012200_",
  "20261113012300_", "20261113012400_",
];

// This is a synthetic test HMAC, NEVER the real app anti-abuse secret.
export function quotaKey(scope, value) {
  const digest = createHmac("sha256", Buffer.alloc(32, 0x42))
    .update(scope, "utf8").update(Buffer.from([0]))
    .update(value, "utf8").digest("hex");
  return "anti-abuse-hmac-sha256:v1:" + digest;
}

export function syntheticRequest(marker = randomUUID()) {
  return {
    operationId: randomUUID(),
    ids: Array.from({ length: 5 }, () => randomUUID()),
    keys: ISSUE_SCOPES.map(([scope]) => quotaKey(scope, marker)),
    marker,
  };
}

export function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

export async function attestQuotaSchema(client) {
  const { rows } = await client.query(
    "SELECT migration_name, finished_at, rolled_back_at " +
    "FROM public._prisma_migrations WHERE migration_name LIKE '2026111301%'",
  );
  for (const prefix of required) {
    const matching = rows.filter((row) => row.migration_name.startsWith(prefix));
    if (matching.length !== 1 || !matching[0].finished_at ||
        matching[0].rolled_back_at) {
      throw new Error("Issue416 R02 PG17 NOT RUN: missing/failed " + prefix);
    }
  }
  if (rows.some((row) => !row.finished_at && !row.rolled_back_at)) {
    throw new Error("Issue416 R02 PG17 NOT RUN: unresolved Prisma history.");
  }
}

export async function attestedQuotaClient(urlKey = "MIGRATION_DATABASE_URL") {
  assertPg17QuotaRelease();
  await preflightIssue416Target(); // W9 fixture identity before DB connection.
  const client = new Client({
    connectionString: process.env[urlKey], connectionTimeoutMillis: 3000,
  });
  await client.connect();
  try {
    if (urlKey === "MIGRATION_DATABASE_URL") await attestQuotaSchema(client);
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

// Every fixture transaction is rolled back even when a test throws.
export async function withQuotaRollback(action) {
  const client = await attestedQuotaClient();
  try {
    await client.query("BEGIN");
    await client.query("SET ROLE vap1_proof_owner");
    return await action(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

export async function reserveQuota(client, request) {
  const { rows } = await client.query(
    "SELECT bundle_state, reservation_ids FROM " +
    "auth_proof_private.reserve_reset_issue_quota(" +
    "$1::text,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::uuid," +
    "$7::uuid,$8::uuid,$9::text,$10::text,$11::text,$12::text)",
    [AUDIENCE, request.operationId, fingerprint(request.marker),
      ...request.ids, ...request.keys],
  );
  return rows[0];
}

export async function expectSavepointRejection(client, action, expectedCode) {
  await client.query("SAVEPOINT quota_negative");
  try {
    await action();
    throw new Error("Expected SQL rejection, but the statement succeeded.");
  } catch (error) {
    if (error.code !== expectedCode) throw error;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT quota_negative");
    await client.query("RELEASE SAVEPOINT quota_negative");
  }
}
