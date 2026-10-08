import type { Client } from "pg";
import { expect } from "vitest";

export async function assertGuestAntiAbuseSchema(
  client: Client,
  expectPostgresError: (
    operation: Promise<unknown>,
    code: string,
    constraint: string,
  ) => Promise<void>,
): Promise<void> {
  const columns = await client.query<{
    column_default: string | null;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'anti_abuse_events'
       ORDER BY ordinal_position`,
  );
  expect(columns.rows.map((row) => row.column_name)).toEqual([
    "id",
    "scope",
    "key_hash",
    "occurred_at",
    "state",
    "request_class",
    "group_key_hash",
  ]);
  for (const row of columns.rows) {
    expect(row.is_nullable).toBe(
      ["request_class", "group_key_hash"].includes(row.column_name)
        ? "YES"
        : "NO",
    );
  }
  expect(
    columns.rows.find((row) => row.column_name === "id")?.column_default,
  ).toContain("gen_random_uuid");
  expect(
    columns.rows.find((row) => row.column_name === "occurred_at")
      ?.column_default,
  ).toContain("clock_timestamp");

  const indexes = await client.query<{
    indexdef: string;
    indexname: string;
  }>(
    `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'anti_abuse_events'`,
  );
  expect(
    indexes.rows.find(
      (row) =>
        row.indexname === "anti_abuse_events_scope_key_hash_occurred_at_idx",
    )?.indexdef,
  ).toContain("(scope, key_hash, occurred_at)");

  const validHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
  await client.query(
    `INSERT INTO anti_abuse_events (scope, key_hash, state)
       VALUES ('v1:guest-token', $1, 'COUNTED')`,
    [validHash],
  );
  for (const [scope, hash, state, constraint] of [
    ["v2:guest-token", validHash, "COUNTED", "anti_abuse_events_scope_check"],
    [
      "v1:guest-token",
      "raw-token",
      "COUNTED",
      "anti_abuse_events_key_hash_check",
    ],
    ["v1:guest-token", validHash, "FAILED", "anti_abuse_events_state_check"],
  ] as const) {
    await expectPostgresError(
      client.query(
        `INSERT INTO anti_abuse_events (scope, key_hash, state)
           VALUES ($1, $2, $3)`,
        [scope, hash, state],
      ),
      "23514",
      constraint,
    );
  }

  const cleanup = await client.query<{
    proargtypes: string;
    prosecdef: boolean;
  }>(
    `SELECT proargtypes::text, prosecdef
       FROM pg_proc
       WHERE proname = 'cleanup_expired_anti_abuse_events'`,
  );
  expect(cleanup.rows).toEqual([{ proargtypes: "", prosecdef: true }]);
}
