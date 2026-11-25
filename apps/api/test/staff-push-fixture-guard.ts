import type { Pool, PoolClient } from "pg";

type GuardedTable = "staff_push_deliveries" | "staff_push_intents" | "staff_push_registrations";

const guardTriggers: Record<GuardedTable, string> = {
  staff_push_deliveries: "staff_push_delivery_guard_trigger",
  staff_push_intents: "staff_push_intent_immutable_guard_trigger",
  staff_push_registrations: "staff_push_registration_guard_trigger",
};

/**
 * Seed exceptional historical states in an independently created test database.
 * The fixture owner may suspend only the named Staff Push guard triggers during
 * one transaction; real CHECK/FK constraints remain enforced. A rollback restores
 * trigger state automatically, and a commit always follows re-enablement.
 *
 * Why the callers need historical setup rather than normal producers:
 * - claim/worker-results: move retries due or simulate near-expired intents
 *   without waiting for real backoff, plus an otherwise unclaimable attempt count.
 * - cleanup: move immutable intent/delivery and terminal registration timestamps
 *   across seven-/thirty-day retention boundaries.
 * - crash/lease/fcm/outage races: expire an already leased delivery immediately
 *   to exercise actual worker fencing and recovery.
 * - worker-eligibility: intentionally corrupt an immutable retrieval intent's
 *   task type relation for a negative reader test.
 * - stale-confirmation: backdate registration identity past thirty days before
 *   exercising the actual authenticated confirmation/maintenance race.
 */
export async function withStaffPushFixtureGuardsDisabled<T>(
  pool: Pool,
  expectedDatabaseName: string,
  tables: readonly GuardedTable[],
  seed: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const uniqueTables = [...new Set(tables)];
  if (uniqueTables.length === 0) throw new Error("Fixture must name a guarded table.");
  const client = await pool.connect();
  try {
    const result = await client.query<{ db: string; owns_database: boolean }>(
      `SELECT current_database() AS db,
              pg_get_userbyid(datdba) = current_user AS owns_database
       FROM pg_database WHERE datname = current_database()`,
    );
    const databaseName = result.rows[0]?.db ?? "";
    if (databaseName !== expectedDatabaseName ||
        (!/^vlt_005b_[a-f0-9]{10}_[a-z0-9_]+$/.test(databaseName) &&
         !/^valet_mob007_auth_[a-z0-9_]+$/.test(databaseName)) ||
        !result.rows[0]?.owns_database) {
      throw new Error("Staff Push test-only mutation requires a disposable fixture database.");
    }
    await client.query("BEGIN");
    const assertEnabledGuards = async () => {
      const guards = await client.query<{ table_name: string }>(
        `WITH expected AS (
           SELECT * FROM unnest($1::text[], $2::text[])
             AS pair(table_name, trigger_name)
         )
         SELECT expected.table_name
         FROM expected
         JOIN pg_class AS c ON c.relname = expected.table_name
           AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
         JOIN pg_trigger AS t ON t.tgrelid = c.oid
           AND t.tgname = expected.trigger_name
         WHERE pg_get_userbyid(c.relowner) = current_user
           AND t.tgenabled = 'O' AND NOT t.tgisinternal`,
        [uniqueTables, uniqueTables.map((table) => guardTriggers[table])],
      );
      if (guards.rowCount !== uniqueTables.length ||
          new Set(guards.rows.map((row) => row.table_name)).size !== uniqueTables.length) {
        throw new Error("Staff Push fixture needs owned tables with enabled original guards.");
      }
    };
    await assertEnabledGuards();
    for (const table of uniqueTables) {
      await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${guardTriggers[table]}`);
    }
    const value = await seed(client);
    for (const table of [...uniqueTables].reverse()) {
      await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER ${guardTriggers[table]}`);
    }
    await assertEnabledGuards();
    await client.query("COMMIT");
    await assertEnabledGuards();
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
