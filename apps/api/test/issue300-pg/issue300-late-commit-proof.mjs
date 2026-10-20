import assert from "node:assert/strict";
import pg from "pg";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Issue300 task-owned PostgreSQL target is required");
const url = new globalThis.URL(raw);
if (url.hostname !== "127.0.0.1" || url.port !== "55480" ||
    url.pathname !== "/issue300_g2" || url.search || url.hash) {
  throw new Error("Unsafe unknown PostgreSQL target");
}

// Dedicated Issue #300 schema name; never operate on shared valet or app tables.
const table = "issue300_g2_late_commit_probe";
const writer = new pg.Client({ connectionString: raw, application_name: "issue300_race_writer" });
const reader = new pg.Client({ connectionString: raw, application_name: "issue300_race_reader" });
await writer.connect();
try {
  await reader.connect();
  try {
    const original = await writer.query(
      `SELECT to_regclass('public.${table}')::text AS table_name`,
    );
    if (original.rows[0].table_name !== null)
      throw new Error("Test-only race table already exists; do not replace it");
    await writer.query(
      `CREATE TABLE public.${table} (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        occurred_at timestamptz NOT NULL,
        birth xid8 NOT NULL DEFAULT pg_current_xact_id()
      )`,
    );
    await writer.query("BEGIN");
    await writer.query(
      `INSERT INTO public.${table}(occurred_at)
       VALUES ('2026-10-16T11:01:00Z')`,
    );
    // Writer is open, event occurred before the search window upper bound.
    const snap = await reader.query(
      "SELECT pg_current_snapshot()::text AS snapshot, clock_timestamp() AS cutoff",
    );
    await writer.query("COMMIT");
    const result = await reader.query(
      `SELECT count(*) FILTER (WHERE occurred_at < $1::timestamptz) AS naive,
        count(*) FILTER (WHERE occurred_at < $1::timestamptz
          AND pg_visible_in_snapshot(birth, $2::pg_snapshot)) AS fenced
       FROM public.${table}`,
      [snap.rows[0].cutoff, snap.rows[0].snapshot],
    );
    assert.equal(Number(result.rows[0].naive), 1);
    assert.equal(Number(result.rows[0].fenced), 0);
    globalThis.console.log("PASS PG17 two-connections: late commit with earlier occurredAt breaches time-only fence");
    globalThis.console.log("PASS PG17 two-connections: immutable xid8 marker excludes late commit under old snapshot");
    globalThis.console.log("GAP: source-specific birth markers/trigger/legacy NULL/rollout absent; U05 not accepted");
  } finally {
    await writer.query("ROLLBACK").catch(() => undefined);
    const check = await writer.query(
      `SELECT to_regclass('public.${table}')::text AS table_name`,
    );
    if (check.rows[0].table_name === table) {
      await writer.query(`DROP TABLE public.${table}`);
    }
    await reader.end().catch(() => undefined);
  }
} finally {
  await writer.end();
}
