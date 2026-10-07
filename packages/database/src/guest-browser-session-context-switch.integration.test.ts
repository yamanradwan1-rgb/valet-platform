import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyBaselineMigrations,
  applyGuestBrowserContextMigrations,
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
  guestBrowserT1Migration,
  seedT1Session,
  seedT1SiblingSession,
} from "./guest-browser-session-test-fixture.js";

interface BrowserPair {
  readonly browser: string;
  readonly enrollment: string;
}

interface PreparedSwitch extends BrowserPair {
  readonly marker: string;
}

const secret = (prefix: "vgb1." | "vge1.", char: string): string =>
  `${prefix}${char.repeat(43)}`;

let databaseName = "";
let databaseUrl = "";
let client: Client;
let counter = 0;

function nextPair(): BrowserPair {
  counter += 1;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const a = alphabet[counter % alphabet.length]!;
  const b = alphabet[(counter + 17) % alphabet.length]!;
  return { browser: secret("vgb1.", a), enrollment: secret("vge1.", b) };
}

async function enrollAndExchange(
  token: string,
): Promise<BrowserPair> {
  const pair = nextPair();
  expect(
    (
      await client.query<{ result_code: string }>(
        "SELECT result_code FROM guest_browser_enroll($1,$2)",
        [pair.enrollment, pair.browser],
      )
    ).rows[0]?.result_code,
  ).toBe("OK");
  expect(
    (
      await client.query<{ result_code: string }>(
        "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
        [token, pair.enrollment, pair.browser],
      )
    ).rows[0]?.result_code,
  ).toBe("AUTHORIZED");
  return pair;
}

async function prepare(
  targetToken: string,
  sourceBrowser: string,
): Promise<{
  readonly result: string;
  readonly scope: string | null;
  readonly transition: PreparedSwitch;
}> {
  const transition = nextPair();
  const result = await client.query<{
    authority_scope: string | null;
    browser_context_marker: string | null;
    result_code: string;
  }>(
    `SELECT result_code, authority_scope, browser_context_marker
     FROM guest_browser_prepare_context($1,$2,$3,$4)`,
    [targetToken, sourceBrowser, transition.enrollment, transition.browser],
  );
  return {
    result: result.rows[0]?.result_code ?? "MISSING",
    scope: result.rows[0]?.authority_scope ?? null,
    transition: {
      ...transition,
      marker: result.rows[0]?.browser_context_marker ?? "",
    },
  };
}

async function switchContext(
  targetToken: string,
  sourceBrowser: string,
  transition: BrowserPair,
  target: Client = client,
): Promise<string> {
  const result = await target.query<{ result_code: string }>(
    `SELECT result_code FROM guest_browser_switch_context($1,$2,$3,$4)`,
    [targetToken, sourceBrowser, transition.enrollment, transition.browser],
  );
  return result.rows[0]?.result_code ?? "MISSING";
}

async function resolve(browser: string): Promise<string> {
  const result = await client.query<{
    authority_scope: string | null;
    result_code: string;
  }>(
    "SELECT result_code,authority_scope FROM guest_browser_resolve($1,TRUE)",
    [browser],
  );
  const row = result.rows[0];
  return row?.result_code === "OK"
    ? `OK:${row.authority_scope}`
    : (row?.result_code ?? "MISSING");
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_context_switch");
  databaseName = database.databaseName;
  databaseUrl = database.databaseUrl;
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await applyBaselineMigrations(client);
  await applyMigration(client, guestBrowserT1Migration);
  await applyGuestBrowserContextMigrations(client);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

describe("DEC-064 same-browser context switch", () => {
  it("reconciles the same visit without a second Browser Session or authority loss", async () => {
    const token = "a".repeat(43);
    const visit = await seedT1Session(client, "same", token, { state: "PARKED" });
    const source = await enrollAndExchange(token);
    await client.query(
      "UPDATE valet_sessions SET customer_access_expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
      [visit.sessionId],
    );
    const before = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [visit.sessionId],
    );
    const prepared = await prepare(token, source.browser);
    expect(prepared.result).toBe("SAME_VISIT");
    expect(prepared.scope).toBe("ACTIVE");
    expect(prepared.transition.marker).toMatch(/^vgc1\.[0-9a-f]{32}$/);
    const after = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [visit.sessionId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
  });

  it("prepares a different ACTIVE visit without mutation, then switches atomically and recovers idempotently", async () => {
    const sourceToken = "b".repeat(43);
    const targetToken = "c".repeat(43);
    const sourceVisit = await seedT1Session(client, "active-source", sourceToken, {
      state: "PARKED",
    });
    const targetVisit = await seedT1SiblingSession(
      client,
      "active-target",
      targetToken,
      sourceVisit,
      { state: "PARKED" },
    );
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    expect(prepared.result).toBe("CONTEXT_CONFLICT");
    expect(prepared.scope).toBe("ACTIVE");
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
    const targetBefore = await client.query<{
      consumed: Date | null;
      browser_count: number;
    }>(
      `SELECT s.customer_access_consumed_at AS consumed,
              (SELECT count(*)::int FROM guest_browser_sessions b WHERE b.valet_session_id=s.id) AS browser_count
       FROM valet_sessions s WHERE s.id=$1`,
      [targetVisit.sessionId],
    );
    expect(targetBefore.rows[0]).toEqual({ browser_count: 0, consumed: null });

    expect(await switchContext(targetToken, source.browser, prepared.transition)).toBe(
      "SWITCHED",
    );
    expect(await resolve(source.browser)).toBe("INVALID_ACCESS");
    expect(await resolve(prepared.transition.browser)).toBe("OK:ACTIVE");

    await client.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '2 minutes',
           expires_at=clock_timestamp()-interval '1 minute'
       WHERE enrollment_token_hash=guest_browser_hash_secret($1)`,
      [prepared.transition.enrollment],
    );
    expect(await switchContext(targetToken, source.browser, prepared.transition)).toBe(
      "RECOVERED",
    );
    const reconciled = await client.query<{
      browser_context_marker: string | null;
      result_code: string;
    }>(
      `SELECT result_code,browser_context_marker
       FROM guest_browser_reconcile_switch($1,$2,$3)`,
      [source.browser, prepared.transition.enrollment, prepared.transition.browser],
    );
    expect(reconciled.rows[0]).toEqual({
      browser_context_marker: prepared.transition.marker,
      result_code: "RECOVERED",
    });
    const targetAfter = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_sessions WHERE valet_session_id=$1",
      [targetVisit.sessionId],
    );
    expect(targetAfter.rows[0]?.count).toBe(1);
  });

});
