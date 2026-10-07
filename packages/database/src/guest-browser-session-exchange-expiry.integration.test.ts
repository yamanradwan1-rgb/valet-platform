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

const guestToken = "X".repeat(43);
const enrollmentToken = `vge1.${"Y".repeat(43)}`;
const browserToken = `vgb1.${"Z".repeat(43)}`;

let databaseName = "";
let client: Client;

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_expired_exchange");
  databaseName = database.databaseName;
  client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  await applyMigration(client, guestBrowserT1Migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 T1 first exchange expiry boundary", () => {
  it("does not consume or authorize an already-expired legacy bearer", async () => {
    const session = await seedT1Session(client, "expired-fresh", guestToken, {
      expiresIn: "-1 second",
    });
    const enrolled = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_enroll($1,$2)`,
      [enrollmentToken, browserToken],
    );
    expect(enrolled.rows[0]?.result_code).toBe("OK");

    const exchange = await client.query<{ result_code: string }>(
      `SELECT result_code FROM guest_browser_exchange($1,$2,$3)`,
      [guestToken, enrollmentToken, browserToken],
    );
    expect(exchange.rows[0]?.result_code).toBe("INVALID_ACCESS");

    const state = await client.query<{
      browser_count: number;
      consumed_at: Date | null;
      exchanged_at: Date | null;
    }>(
      `SELECT s.customer_access_consumed_at AS consumed_at,
              e.exchanged_at,
              count(b.id)::int AS browser_count
       FROM valet_sessions s
       JOIN guest_browser_enrollments e ON e.enrollment_token_hash=guest_browser_hash_secret($2)
       LEFT JOIN guest_browser_sessions b ON b.valet_session_id=s.id
       WHERE s.id=$1
       GROUP BY s.customer_access_consumed_at,e.exchanged_at`,
      [session.sessionId, enrollmentToken],
    );
    expect(state.rows[0]).toEqual({
      browser_count: 0,
      consumed_at: null,
      exchanged_at: null,
    });
  });
});
