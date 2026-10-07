import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyBaselineMigrations,
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
  guestBrowserT1Migration,
  seedT1Session,
} from "./guest-browser-session-test-fixture.js";

let databaseName = "";
let databaseUrl = "";
let client: Client;

async function waitForLock(contenderPid: number): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          await client.query<{ wait_event_type: string | null }>(
            "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
            [contenderPid],
          )
        ).rows[0]?.wait_event_type,
      { timeout: 5_000 },
    )
    .toBe("Lock");
}

async function waitForDatabaseTime(boundary: Date): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          await client.query<{ reached: boolean }>(
            "SELECT clock_timestamp() >= $1::timestamptz AS reached",
            [boundary],
          )
        ).rows[0]?.reached,
      { timeout: 5_000 },
    )
    .toBe(true);
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_lock_expiry");
  databaseName = database.databaseName;
  databaseUrl = database.databaseUrl;
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  await applyMigration(client, guestBrowserT1Migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 T1 lock-wait expiry authority", () => {
  it("denies a fresh exchange when bearer expiry passes while waiting for the session lock", async () => {
    const guestToken = "E".repeat(43);
    const enrollment = `vge1.${"F".repeat(43)}`;
    const browser = `vgb1.${"G".repeat(43)}`;
    const visit = await seedT1Session(client, "lock-exchange", guestToken, {
      state: "PARKED",
    });
    await client.query("SELECT guest_browser_enroll($1,$2)", [enrollment, browser]);

    const locker = new Client({ connectionString: databaseUrl });
    const contender = new Client({ connectionString: databaseUrl });
    await locker.connect();
    await contender.connect();
    try {
      await locker.query("BEGIN");
      const expiry = await locker.query<{ expires_at: Date }>(
        `UPDATE valet_sessions
         SET customer_access_expires_at=clock_timestamp()+interval '1 second'
         WHERE id=$1
         RETURNING customer_access_expires_at AS expires_at`,
        [visit.sessionId],
      );
      const contenderPid = (
        await contender.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      const exchange = contender.query<{ result_code: string }>(
        "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
        [guestToken, enrollment, browser],
      );
      await waitForLock(contenderPid);
      await waitForDatabaseTime(expiry.rows[0]!.expires_at);
      await locker.query("COMMIT");
      expect((await exchange).rows[0]?.result_code).toBe("INVALID_ACCESS");
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      await locker.end();
      await contender.end();
    }
  });

  it("denies post-visit resolve when the 24-hour boundary passes while waiting for the session lock", async () => {
    const guestToken = "P".repeat(43);
    const enrollment = `vge1.${"Q".repeat(43)}`;
    const browser = `vgb1.${"R".repeat(43)}`;
    const visit = await seedT1Session(client, "lock-resolve", guestToken, {
      state: "PARKED",
    });
    await client.query("SELECT guest_browser_enroll($1,$2)", [enrollment, browser]);
    const exchanged = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [guestToken, enrollment, browser],
    );
    expect(exchanged.rows[0]?.result_code).toBe("AUTHORIZED");

    const locker = new Client({ connectionString: databaseUrl });
    const contender = new Client({ connectionString: databaseUrl });
    await locker.connect();
    await contender.connect();
    try {
      await locker.query("BEGIN");
      const expiry = await locker.query<{ expires_at: Date }>(
        `UPDATE valet_sessions
         SET state='COMPLETED',
             completed_at=clock_timestamp()-interval '23 hours 59 minutes 59 seconds'
         WHERE id=$1
         RETURNING completed_at + interval '24 hours' AS expires_at`,
        [visit.sessionId],
      );
      const contenderPid = (
        await contender.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows[0]!.pid;
      const resolve = contender.query<{ result_code: string }>(
        "SELECT result_code FROM guest_browser_resolve($1,TRUE)",
        [browser],
      );
      await waitForLock(contenderPid);
      await waitForDatabaseTime(expiry.rows[0]!.expires_at);
      await locker.query("COMMIT");
      expect((await resolve).rows[0]?.result_code).toBe("INVALID_ACCESS");
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      await locker.end();
      await contender.end();
    }
  });
});
