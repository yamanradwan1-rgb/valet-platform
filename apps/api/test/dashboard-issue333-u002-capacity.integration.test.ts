import { createServer, type Server } from "node:http";
import { performance } from "node:perf_hooks";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL ?? "";
const directory = process.env.ISSUE333_PG_PRIVATE_DATADIR?.replaceAll(
  "\\",
  "/",
);
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
      Number(parsed.port) > 1024 &&
      Number(parsed.port) !== 5432 &&
      directory?.includes("/tmp/issue-315-pg-qa/issue319-") === true &&
      directory.endsWith("/.issue315-private-cluster")
    );
  } catch {
    return false;
  }
})();

const key = 33320261101;
const pool = enabled
  ? new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 350,
      idleTimeoutMillis: 1000,
    })
  : undefined;
interface HeldReader {
  readonly pid: number;
  readonly response: { end: (text: string) => void; destroy: () => void };
  readonly closed: Promise<void>;
  readonly state: { finished: boolean; closed: boolean; released: boolean };
}
const readers = new Map<string, HeldReader>();
let server: Server;
let baseUrl: string;

async function until(
  condition: () => boolean | Promise<boolean>,
  limitMs = 2000,
) {
  const start = performance.now();
  while (!(await condition())) {
    if (performance.now() - start > limitMs)
      throw new Error("HTTP test gate not reached");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function percentiles(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    p50Ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1]!),
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]!),
  };
}

describe.runIf(enabled)(
  "U-002 candidate session advisory and HTTP pool falsification",
  () => {
    beforeAll(async () => {
      const identity = await pool!.query<{
        role: string;
        database: string;
        directory: string;
      }>(`SELECT current_user AS role, current_database() AS database,
       current_setting('data_directory') AS directory`);
      expect(identity.rows[0]).toMatchObject({
        role: "issue315_owner",
        database: "postgres",
      });
      expect(identity.rows[0]!.directory.replaceAll("\\", "/")).toBe(directory);

      server = createServer(async (request, response) => {
        const id = request.url?.slice(1) ?? "";
        let lease: PoolClient | undefined;
        try {
          lease = await pool!.connect();
          await lease.query("SELECT pg_advisory_lock_shared($1)", [key]);
          const pid = Number(
            (await lease.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
          );
          const owned = lease;
          const state = { finished: false, closed: false, released: false };
          let done!: () => void;
          const closed = new Promise<void>((resolve) => {
            done = resolve;
          });
          const cleanup = () => {
            if (state.released) return;
            state.released = true;
            void owned
              .query("SELECT pg_advisory_unlock_shared($1)", [key])
              .then((result) => {
                if (result.rows[0]?.pg_advisory_unlock_shared !== true) {
                  throw new Error("Lost HTTP advisory ownership");
                }
                owned.release();
              })
              .catch(() => owned.release(true))
              .finally(done);
          };
          response.once("finish", () => {
            state.finished = true;
            cleanup();
          });
          response.once("close", () => {
            state.closed = true;
            cleanup();
          });
          readers.set(id, { pid, response, closed, state });
          response.setHeader("Content-Type", "application/json");
          response.write('{"sentinel":"A_PRIVATE_');
        } catch {
          lease?.release(true);
          response.destroy();
        }
      });
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No loopback port");
      baseUrl = `http://127.0.0.1:${address.port}`;
    }, 10000);

    afterAll(async () => {
      for (const held of readers.values()) held.response.destroy();
      await Promise.all([...readers.values()].map((held) => held.closed));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool?.end();
    }, 10000);

    it("holds the exclusive writer until actual server finish, not SQL completion", async () => {
      const reply = await fetch(`${baseUrl}/r1`);
      await until(() => readers.has("r1"));
      const held = readers.get("r1")!;
      expect(held.state.finished).toBe(false);
      const writer = await pool!.connect();
      let committedAt = 0;
      try {
        await writer.query("BEGIN");
        await writer.query("SET LOCAL lock_timeout='1500ms'");
        const writerPid = Number(
          (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
        const started = performance.now();
        const pending = writer.query("SELECT pg_advisory_xact_lock($1)", [key]);
        await until(async () => {
          const blockers = await pool!.query<{ pids: number[] }>(
            "SELECT pg_blocking_pids($1) AS pids",
            [writerPid],
          );
          return blockers.rows[0]?.pids.includes(held.pid) === true;
        });
        expect(held.state.finished).toBe(false);
        held.response.end('SENTINEL"}');
        await held.closed;
        expect(held.state.finished).toBe(true);
        await pending;
        await writer.query("COMMIT");
        committedAt = performance.now();
        console.info(
          "U002_C001_writer_wait",
          JSON.stringify({
            poolMax: 4,
            waitedMs: Math.round(committedAt - started),
            readerFinishedBeforeCommit: held.state.finished,
            selectedBackendPidRecorded: held.pid > 0,
          }),
        );
        expect(await reply.text()).toContain("A_PRIVATE_SENTINEL");
        expect(committedAt).toBeGreaterThan(0);
      } finally {
        await writer.query("ROLLBACK").catch(() => undefined);
        writer.release();
      }
    }, 10000);

    it("shows four slow readers can exhaust a four-connection pool", async () => {
      const availableSamples: number[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const started = performance.now();
        const lease = await pool!.connect();
        availableSamples.push(performance.now() - started);
        lease.release();
      }
      const replies = await Promise.all(
        [2, 3, 4, 5].map((id) => fetch(`${baseUrl}/r${id}`)),
      );
      await until(() => [2, 3, 4, 5].every((id) => readers.has(`r${id}`)));
      try {
        expect(pool!.totalCount).toBe(4);
        expect(pool!.idleCount).toBe(0);
        const contendedSamples = await Promise.all(
          Array.from({ length: 5 }, async () => {
            const started = performance.now();
            await expect(pool!.connect()).rejects.toThrow();
            return performance.now() - started;
          }),
        );
        expect(
          [2, 3, 4, 5].every(
            (id) => readers.get(`r${id}`)!.state.finished === false,
          ),
        ).toBe(true);
        console.info(
          "U002_C001_pool_pressure",
          JSON.stringify({
            poolMax: pool!.options.max,
            checkedOut: pool!.totalCount - pool!.idleCount,
            waitingAfterTimeout: pool!.waitingCount,
            withoutContention: percentiles(availableSamples),
            saturated: percentiles(contendedSamples),
            heldResponseBytesAtGate: Buffer.byteLength(
              '{"sentinel":"A_PRIVATE_',
            ),
          }),
        );
      } finally {
        for (const id of [2, 3, 4, 5])
          readers.get(`r${id}`)!.response.end('END"}');
        await Promise.all(
          [2, 3, 4, 5].map((id) => readers.get(`r${id}`)!.closed),
        );
        await Promise.all(replies.map((reply) => reply.text()));
      }
      expect((await pool!.query("SELECT 1 AS alive")).rows[0].alive).toBe(1);
      expect(pool!.waitingCount).toBe(0);
    }, 10000);
  },
);
