import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  applyBaselineMigrations,
  applyGuestBrowserContextMigrations,
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
  guestBrowserT1Migration,
  hashGuestSecret,
  seedT1Session,
  seedT1SiblingSession,
} from "./guest-browser-session-test-fixture.js";

const liveEnrollment = `vge1.${"L".repeat(43)}`;
const liveBrowser = `vgb1.${"M".repeat(43)}`;
const exchangedEnrollment = `vge1.${"X".repeat(43)}`;
const exchangedBrowser = `vgb1.${"Y".repeat(43)}`;
const exchangedGuest = "Q".repeat(43);

let databaseName = "";
let databaseUrl = "";
let client: Client;

async function enroll(
  target: Client,
  enrollment: string,
  browser: string,
): Promise<string> {
  const result = await target.query<{ result_code: string }>(
    "SELECT result_code FROM guest_browser_enroll($1,$2)",
    [enrollment, browser],
  );
  return result.rows[0]?.result_code ?? "MISSING";
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_enrollment_cleanup");
  databaseName = database.databaseName;
  databaseUrl = database.databaseUrl;
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  await applyMigration(client, guestBrowserT1Migration);
  await applyGuestBrowserContextMigrations(client);
}, 120_000);

beforeEach(async () => {
  await client.query("DELETE FROM guest_browser_sessions");
  await client.query("DELETE FROM guest_browser_enrollments");
});

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 T1 expired enrollment retention", () => {
  it("removes only expired unexchanged rows and retains live pending rows", async () => {
    const expiredEnrollment = `vge1.${"E".repeat(43)}`;
    const expiredBrowser = `vgb1.${"F".repeat(43)}`;
    await client.query(
      `INSERT INTO guest_browser_enrollments(
         enrollment_token_hash,browser_session_token_hash,created_at,expires_at)
       VALUES($1,$2,clock_timestamp()-interval '30 minutes',
              clock_timestamp()-interval '15 minutes')`,
      [hashGuestSecret(expiredEnrollment), hashGuestSecret(expiredBrowser)],
    );
    expect(await enroll(client, liveEnrollment, liveBrowser)).toBe("OK");
    expect(
      await enroll(
        client,
        `vge1.${"T".repeat(43)}`,
        `vgb1.${"U".repeat(43)}`,
      ),
    ).toBe("OK");

    const retained = await client.query<{ token_hash: string }>(
      `SELECT enrollment_token_hash AS token_hash
       FROM guest_browser_enrollments ORDER BY enrollment_token_hash`,
    );
    const hashes = retained.rows.map((row) => row.token_hash);
    expect(hashes).not.toContain(hashGuestSecret(expiredEnrollment));
    expect(hashes).toContain(hashGuestSecret(liveEnrollment));
  });

  it("never deletes an exchanged enrollment needed for lost-response recovery", async () => {
    const visit = await seedT1Session(client, "cleanup-exchanged", exchangedGuest, {
      state: "PARKED",
    });
    expect(await enroll(client, exchangedEnrollment, exchangedBrowser)).toBe("OK");
    const first = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [exchangedGuest, exchangedEnrollment, exchangedBrowser],
    );
    expect(first.rows[0]?.result_code).toBe("AUTHORIZED");

    await client.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '30 minutes',
           expires_at=clock_timestamp()-interval '15 minutes'
       WHERE enrollment_token_hash=$1`,
      [hashGuestSecret(exchangedEnrollment)],
    );
    expect(
      await enroll(
        client,
        `vge1.${"V".repeat(43)}`,
        `vgb1.${"W".repeat(43)}`,
      ),
    ).toBe("OK");

    const persisted = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM guest_browser_enrollments e
       JOIN guest_browser_sessions b ON b.enrollment_id=e.id
       WHERE e.valet_session_id=$1`,
      [visit.sessionId],
    );
    expect(persisted.rows[0]?.count).toBe(1);
    const recovered = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [exchangedGuest, exchangedEnrollment, exchangedBrowser],
    );
    expect(recovered.rows[0]?.result_code).toBe("RECOVERED");
  });

  it("skips a concurrently locked expired row, then reclaims it later", async () => {
    const lockedEnrollment = `vge1.${"C".repeat(43)}`;
    const lockedBrowser = `vgb1.${"D".repeat(43)}`;
    await client.query(
      `INSERT INTO guest_browser_enrollments(
         enrollment_token_hash,browser_session_token_hash,created_at,expires_at)
       VALUES($1,$2,clock_timestamp()-interval '30 minutes',
              clock_timestamp()-interval '15 minutes')`,
      [hashGuestSecret(lockedEnrollment), hashGuestSecret(lockedBrowser)],
    );

    const locker = new Client({ connectionString: databaseUrl });
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        `SELECT id FROM guest_browser_enrollments
         WHERE enrollment_token_hash=$1 FOR UPDATE`,
        [hashGuestSecret(lockedEnrollment)],
      );
      expect(
        await enroll(
          client,
          `vge1.${"G".repeat(43)}`,
          `vgb1.${"H".repeat(43)}`,
        ),
      ).toBe("OK");
      const whileLocked = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM guest_browser_enrollments
         WHERE enrollment_token_hash=$1`,
        [hashGuestSecret(lockedEnrollment)],
      );
      expect(whileLocked.rows[0]?.count).toBe(1);
      await locker.query("ROLLBACK");
    } finally {
      await locker.end();
    }

    expect(
      await enroll(
        client,
        `vge1.${"I".repeat(43)}`,
        `vgb1.${"J".repeat(43)}`,
      ),
    ).toBe("OK");
    const reclaimed = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM guest_browser_enrollments
       WHERE enrollment_token_hash=$1`,
      [hashGuestSecret(lockedEnrollment)],
    );
    expect(reclaimed.rows[0]?.count).toBe(0);
  });

  it("bounds each cleanup pass and converges a pre-existing expired backlog", async () => {
    await client.query(
      `INSERT INTO guest_browser_enrollments(
         enrollment_token_hash,browser_session_token_hash,created_at,expires_at)
       SELECT guest_browser_hash_secret('vge1.' || substr(md5(gs::text) || md5('e' || gs::text),1,43)),
              guest_browser_hash_secret('vgb1.' || substr(md5('b' || gs::text) || md5('c' || gs::text),1,43)),
              clock_timestamp()-interval '30 minutes',
              clock_timestamp()-interval '15 minutes'
       FROM generate_series(1,300) AS gs`,
    );

    expect(await enroll(client, liveEnrollment, liveBrowser)).toBe("OK");
    const afterOne = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM guest_browser_enrollments
       WHERE expires_at <= clock_timestamp() AND exchanged_at IS NULL`,
    );
    expect(afterOne.rows[0]?.count).toBe(44);

    expect(
      await enroll(
        client,
        `vge1.${"K".repeat(43)}`,
        `vgb1.${"N".repeat(43)}`,
      ),
    ).toBe("OK");
    const afterTwo = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM guest_browser_enrollments
       WHERE expires_at <= clock_timestamp() AND exchanged_at IS NULL`,
    );
    expect(afterTwo.rows[0]?.count).toBe(0);
  });

  it("reclaims an expired abandoned source-bound context-switch preparation without touching source authority", async () => {
    const sourceToken = "O".repeat(43);
    const targetToken = "P".repeat(43);
    const sourceVisit = await seedT1Session(client, "cleanup-switch-source", sourceToken, {
      state: "PARKED",
    });
    await seedT1SiblingSession(
      client,
      "cleanup-switch-target",
      targetToken,
      sourceVisit,
      { state: "PARKED" },
    );
    const sourceEnrollment = `vge1.${"Q".repeat(43)}`;
    const sourceBrowser = `vgb1.${"R".repeat(43)}`;
    expect(await enroll(client, sourceEnrollment, sourceBrowser)).toBe("OK");
    const exchanged = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
      [sourceToken, sourceEnrollment, sourceBrowser],
    );
    expect(exchanged.rows[0]?.result_code).toBe("AUTHORIZED");

    const switchEnrollment = `vge1.${"S".repeat(43)}`;
    const switchBrowser = `vgb1.${"T".repeat(43)}`;
    const prepared = await client.query<{ result_code: string }>(
      `SELECT result_code
       FROM guest_browser_prepare_context($1,$2,$3,$4)`,
      [targetToken, sourceBrowser, switchEnrollment, switchBrowser],
    );
    expect(prepared.rows[0]?.result_code).toBe("CONTEXT_CONFLICT");
    await client.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '30 minutes',
           expires_at=clock_timestamp()-interval '15 minutes'
       WHERE enrollment_token_hash=$1`,
      [hashGuestSecret(switchEnrollment)],
    );

    expect(
      await enroll(
        client,
        `vge1.${"U".repeat(43)}`,
        `vgb1.${"V".repeat(43)}`,
      ),
    ).toBe("OK");
    const abandoned = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM guest_browser_enrollments
       WHERE enrollment_token_hash=$1`,
      [hashGuestSecret(switchEnrollment)],
    );
    expect(abandoned.rows[0]?.count).toBe(0);
    const source = await client.query<{ result_code: string }>(
      "SELECT result_code FROM guest_browser_resolve($1,TRUE)",
      [sourceBrowser],
    );
    expect(source.rows[0]?.result_code).toBe("OK");
  });
});
