import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = process.env.ISSUE333_PG_PRIVATE_DATADIR?.replaceAll(
  "\\",
  "/",
);
const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => {
  try {
    const parsed = new URL(url);
    return (
      process.platform === "win32" &&
      process.env.CI !== "true" &&
      process.env.ISSUE333_EPHEMERAL_PG === "I_OWN_THIS_CLUSTER" &&
      process.env.MIGRATION_DATABASE_URL === url &&
      parsed.protocol === "postgresql:" &&
      parsed.hostname === "127.0.0.1" &&
      parsed.username === "issue315_owner" &&
      parsed.pathname === "/postgres" &&
      parsed.password.length > 0 &&
      parsed.search === "" &&
      parsed.hash === "" &&
      Number(parsed.port) > 1024 &&
      Number(parsed.port) !== 5432 &&
      !!directory?.includes("/tmp/issue-315-pg-qa/issue319-") &&
      directory.endsWith("/.issue315-private-cluster")
    );
  } catch {
    return false;
  }
})();

const pool = enabled
  ? new Pool({
      connectionString: url,
      max: 6,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 3000,
    })
  : undefined;
const lock = 33320261031;

async function client(): Promise<PoolClient> {
  const connection = await pool!.connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL statement_timeout='5s'");
  return connection;
}

async function close(...connections: PoolClient[]) {
  for (const connection of connections) {
    await connection.query("ROLLBACK").catch(() => undefined);
    connection.release();
  }
}

async function waitForBlockers(pid: number, expected: number[]) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await pool!.query<{ blockers: number[] }>(
      "SELECT pg_blocking_pids($1) AS blockers",
      [pid],
    );
    const observed = [...result.rows[0]!.blockers].sort((a, b) => a - b);
    if (
      JSON.stringify(observed) ===
      JSON.stringify([...expected].sort((a, b) => a - b))
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Blocker topology did not converge for backend ${pid}.`);
}

describe.runIf(enabled)(
  "Issue333 W6 isolated PostgreSQL harness proofs",
  () => {
    beforeAll(async () => {
      const result = await pool!.query<{
        database: string;
        role: string;
        port: number;
        directory: string;
        version: number;
      }>(`SELECT current_database() AS database, current_user AS role,
      inet_server_port() AS port, current_setting('data_directory') AS directory,
      current_setting('server_version_num')::int AS version`);
      expect(result.rows[0]).toMatchObject({
        database: "postgres",
        role: "issue315_owner",
        port: Number(new URL(url).port),
      });
      expect(result.rows[0]!.directory.replaceAll("\\", "/")).toBe(directory);
      expect(result.rows[0]!.version).toBeGreaterThanOrEqual(170000);
      expect(result.rows[0]!.version).toBeLessThan(180000);
    }, 10000);

    afterAll(async () => {
      await pool?.end();
    }, 10000);

    it("holds one EXCLUSIVE revoker behind two independent SHARED reader PIDs", async () => {
      const [first, second, writer] = await Promise.all([
        client(),
        client(),
        client(),
      ]);
      try {
        const readerA = Number(
          (await first.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
        const readerB = Number(
          (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
        const revoker = Number(
          (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
        expect(new Set([readerA, readerB, revoker]).size).toBe(3);
        await Promise.all([
          first.query("SELECT pg_advisory_xact_lock_shared($1)", [lock]),
          second.query("SELECT pg_advisory_xact_lock_shared($1)", [lock]),
        ]);
        const pending = writer.query("SELECT pg_advisory_xact_lock($1)", [
          lock,
        ]);
        await waitForBlockers(revoker, [readerA, readerB]);
        await first.query("COMMIT");
        await waitForBlockers(revoker, [readerB]);
        await second.query("COMMIT");
        await pending;
        await writer.query("COMMIT");
        expect((await pool!.query("SELECT 1 AS alive")).rows[0].alive).toBe(1);
      } finally {
        await close(first, second, writer);
      }
    }, 12000);

    it("rolls back a real lock_timeout SQLSTATE 55P03 and reuses the connection", async () => {
      const [holder, waiter] = await Promise.all([client(), client()]);
      try {
        await holder.query("SELECT pg_advisory_xact_lock($1)", [lock]);
        await waiter.query("SET LOCAL lock_timeout='90ms'");
        await expect(
          waiter.query("SELECT pg_advisory_xact_lock($1)", [lock]),
        ).rejects.toMatchObject({ code: "55P03" });
        await waiter.query("ROLLBACK");
        expect(
          (await waiter.query("SELECT 1 AS recovered")).rows[0].recovered,
        ).toBe(1);
      } finally {
        await close(holder, waiter);
      }
    }, 8000);

    it("rolls back a real statement cancellation SQLSTATE 57014 and recovers", async () => {
      const connection = await client();
      try {
        await connection.query("SET LOCAL statement_timeout='80ms'");
        await expect(
          connection.query("SELECT pg_sleep(0.5)"),
        ).rejects.toMatchObject({ code: "57014" });
        await connection.query("ROLLBACK");
        expect(
          (await connection.query("SELECT 1 AS recovered")).rows[0].recovered,
        ).toBe(1);
      } finally {
        await close(connection);
      }
    }, 8000);

    it("treats injected 40001 as aborted transaction and permits fresh transaction", async () => {
      // Injection here is SQLSTATE mapping evidence, NOT a real serialization race.
      const connection = await client();
      try {
        await expect(
          connection.query(`DO $$ BEGIN
        RAISE EXCEPTION 'synthetic serialization' USING ERRCODE='40001'; END $$`),
        ).rejects.toMatchObject({ code: "40001" });
        await connection.query("ROLLBACK");
        await connection.query("BEGIN");
        expect(
          (await connection.query("SELECT 1 AS retry")).rows[0].retry,
        ).toBe(1);
        await connection.query("COMMIT");
      } finally {
        await close(connection);
      }
    }, 8000);
  },
);
