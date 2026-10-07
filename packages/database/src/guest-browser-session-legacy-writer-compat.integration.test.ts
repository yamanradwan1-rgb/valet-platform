import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyBaselineMigrations,
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
  guestBrowserT1Migration,
  hashGuestSecret,
  seedPreT1Session,
} from "./guest-browser-session-test-fixture.js";

const issuedToken = "I".repeat(43);
const reissuedToken = "R".repeat(43);
const rotatedToken = "T".repeat(43);
const migratedToken = "M".repeat(43);

let databaseName = "";
let client: Client;
let disabledSessionId = "";
let migratedSessionId = "";

async function oldWriterIssueOrRotate(
  sessionId: string,
  rawToken: string,
): Promise<void> {
  await client.query(
    `UPDATE valet_sessions
     SET customer_access_token_hash=$2,
         customer_access_expires_at=clock_timestamp()+interval '1 hour',
         customer_access_revoked_at=NULL,
         updated_at=clock_timestamp()
     WHERE id=$1`,
    [sessionId, hashGuestSecret(rawToken)],
  );
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_legacy_writer");
  databaseName = database.databaseName;
  client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  disabledSessionId = (
    await seedPreT1Session(
      client,
      "legacy-disabled",
      `disabled:intake:${randomUUID()}`,
    )
  ).sessionId;
  migratedSessionId = (
    await seedPreT1Session(client, "legacy-real", hashGuestSecret(migratedToken))
  ).sessionId;
  await applyMigration(client, guestBrowserT1Migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 T1 rolling API compatibility", () => {
  it("bridges old-server issue, revoke, and reissue writes into generations", async () => {
    await oldWriterIssueOrRotate(disabledSessionId, issuedToken);
    const issued = await client.query<{
      consumed_at: Date | null;
      generation: number;
    }>(
      `SELECT customer_access_generation AS generation,
              customer_access_consumed_at AS consumed_at
       FROM valet_sessions WHERE id=$1`,
      [disabledSessionId],
    );
    expect(issued.rows[0]).toEqual({ consumed_at: null, generation: 1 });

    const enrollment = `vge1.${"A".repeat(43)}`;
    const browser = `vgb1.${"B".repeat(43)}`;
    await client.query("SELECT guest_browser_enroll($1,$2)", [enrollment, browser]);
    const exchanged = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [issuedToken, enrollment, browser],
    );
    expect(exchanged.rows[0]?.result_code).toBe("AUTHORIZED");

    await client.query(
      `UPDATE valet_sessions
       SET customer_access_revoked_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE id=$1`,
      [disabledSessionId],
    );
    const revoked = await client.query<{ generation: number }>(
      `SELECT customer_access_generation AS generation
       FROM valet_sessions WHERE id=$1`,
      [disabledSessionId],
    );
    expect(revoked.rows[0]?.generation).toBe(2);
    const oldBrowser = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_resolve($1,TRUE)",
      [browser],
    );
    expect(oldBrowser.rows[0]?.result_code).toBe("INVALID_ACCESS");

    await oldWriterIssueOrRotate(disabledSessionId, reissuedToken);
    const reissued = await client.query<{
      consumed_at: Date | null;
      generation: number;
    }>(
      `SELECT customer_access_generation AS generation,
              customer_access_consumed_at AS consumed_at
       FROM valet_sessions WHERE id=$1`,
      [disabledSessionId],
    );
    expect(reissued.rows[0]).toEqual({ consumed_at: null, generation: 3 });

    const nextEnrollment = `vge1.${"C".repeat(43)}`;
    const nextBrowser = `vgb1.${"D".repeat(43)}`;
    await client.query("SELECT guest_browser_enroll($1,$2)", [
      nextEnrollment,
      nextBrowser,
    ]);
    const nextExchange = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [reissuedToken, nextEnrollment, nextBrowser],
    );
    expect(nextExchange.rows[0]?.result_code).toBe("AUTHORIZED");
  });

  it("increments a migrated real bearer when an old server rotates it", async () => {
    await oldWriterIssueOrRotate(migratedSessionId, rotatedToken);
    const state = await client.query<{
      consumed_at: Date | null;
      generation: number;
    }>(
      `SELECT customer_access_generation AS generation,
              customer_access_consumed_at AS consumed_at
       FROM valet_sessions WHERE id=$1`,
      [migratedSessionId],
    );
    expect(state.rows[0]).toEqual({ consumed_at: null, generation: 2 });
  });
});
