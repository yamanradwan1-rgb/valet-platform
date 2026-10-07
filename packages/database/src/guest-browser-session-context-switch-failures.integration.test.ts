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
  it("rejects an expired uncommitted context transition without harming source or target authority", async () => {
    const sourceToken = "w".repeat(43);
    const targetToken = "x".repeat(43);
    const sourceVisit = await seedT1Session(client, "expired-transition-source", sourceToken, {
      state: "PARKED",
    });
    const targetVisit = await seedT1SiblingSession(
      client,
      "expired-transition-target",
      targetToken,
      sourceVisit,
      { state: "PARKED" },
    );
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    expect(prepared.result).toBe("CONTEXT_CONFLICT");
    await client.query(
      `UPDATE guest_browser_enrollments
       SET created_at=clock_timestamp()-interval '2 minutes',
           expires_at=clock_timestamp()-interval '1 minute'
       WHERE enrollment_token_hash=guest_browser_hash_secret($1)`,
      [prepared.transition.enrollment],
    );

    expect(await switchContext(targetToken, source.browser, prepared.transition)).toBe(
      "INVALID_ACCESS",
    );
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
    expect(await resolve(prepared.transition.browser)).toBe("INVALID_ACCESS");
    const target = await client.query<{ consumed: Date | null; browser_count: number }>(
      `SELECT s.customer_access_consumed_at AS consumed,
              (SELECT count(*)::int FROM guest_browser_sessions b WHERE b.valet_session_id=s.id) AS browser_count
       FROM valet_sessions s WHERE s.id=$1`,
      [targetVisit.sessionId],
    );
    expect(target.rows[0]).toEqual({ browser_count: 0, consumed: null });
  });

  it("rolls back a switch without revoking the source or partially consuming the target", async () => {
    const sourceToken = "d".repeat(43);
    const targetToken = "e".repeat(43);
    const sourceVisit = await seedT1Session(client, "rollback-source", sourceToken, {
      state: "PARKED",
    });
    const targetVisit = await seedT1SiblingSession(
      client,
      "rollback-target",
      targetToken,
      sourceVisit,
      { state: "PARKED" },
    );
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    const transaction = new Client({ connectionString: databaseUrl });
    await transaction.connect();
    try {
      await transaction.query("BEGIN");
      expect(
        await switchContext(targetToken, source.browser, prepared.transition, transaction),
      ).toBe("SWITCHED");
      await transaction.query("ROLLBACK");
    } finally {
      await transaction.end();
    }
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
    expect(await resolve(prepared.transition.browser)).toBe("INVALID_ACCESS");
    const target = await client.query<{ consumed: Date | null; count: number }>(
      `SELECT customer_access_consumed_at AS consumed,
              (SELECT count(*)::int FROM guest_browser_sessions WHERE valet_session_id=$1) AS count
       FROM valet_sessions WHERE id=$1`,
      [targetVisit.sessionId],
    );
    expect(target.rows[0]).toEqual({ consumed: null, count: 0 });
  });

  it("preserves POST_VISIT authority until the explicit switch commits", async () => {
    const sourceToken = "f".repeat(43);
    const targetToken = "g".repeat(43);
    const sourceVisit = await seedT1Session(client, "post-source", sourceToken, {
      state: "PARKED",
    });
    const targetVisit = await seedT1SiblingSession(
      client,
      "post-target",
      targetToken,
      sourceVisit,
      { state: "PARKED" },
    );
    const source = await enrollAndExchange(sourceToken);
    await client.query(
      "UPDATE valet_sessions SET state='COMPLETED',completed_at=clock_timestamp() WHERE id=$1",
      [sourceVisit.sessionId],
    );
    const prepared = await prepare(targetToken, source.browser);
    expect(prepared.result).toBe("CONTEXT_CONFLICT");
    expect(prepared.scope).toBe("POST_VISIT");
    expect(await resolve(source.browser)).toBe("OK:POST_VISIT");
    expect(await switchContext(targetToken, source.browser, prepared.transition)).toBe(
      "SWITCHED",
    );
    expect(await resolve(source.browser)).toBe("INVALID_ACCESS");
    expect(await resolve(prepared.transition.browser)).toBe("OK:ACTIVE");
    const target = await client.query<{ consumed: Date | null }>(
      "SELECT customer_access_consumed_at AS consumed FROM valet_sessions WHERE id=$1",
      [targetVisit.sessionId],
    );
    expect(target.rows[0]?.consumed).toBeInstanceOf(Date);
  });

  it.each([
    ["expired", { expiresIn: "-1 hour" }],
    ["revoked", { revoked: true }],
  ] as const)("rejects a %s target without harming the current Browser Session", async (label, options) => {
    const sourceToken = `${label === "expired" ? "h" : "i"}`.repeat(43);
    const targetToken = `${label === "expired" ? "j" : "k"}`.repeat(43);
    const sourceVisit = await seedT1Session(client, `${label}-source`, sourceToken, {
      state: "PARKED",
    });
    await seedT1SiblingSession(client, `${label}-target`, targetToken, sourceVisit, {
      ...options,
      state: "PARKED",
    });
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    expect(prepared.result).toBe("INVALID_ACCESS");
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
  });

  it("rejects a foreign-tenant target without mutating either authority", async () => {
    const sourceToken = "l".repeat(43);
    const targetToken = "m".repeat(43);
    await seedT1Session(client, "foreign-target", targetToken, { state: "PARKED" });
    await seedT1Session(client, "foreign-source", sourceToken, { state: "PARKED" });
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    expect(prepared.result).toBe("INVALID_ACCESS");
    expect(await resolve(source.browser)).toBe("OK:ACTIVE");
  });

  it("converges duplicate switch clicks to one switch plus one recovery", async () => {
    const sourceToken = "n".repeat(43);
    const targetToken = "o".repeat(43);
    const sourceVisit = await seedT1Session(client, "duplicate-source", sourceToken, {
      state: "PARKED",
    });
    await seedT1SiblingSession(client, "duplicate-target", targetToken, sourceVisit, {
      state: "PARKED",
    });
    const source = await enrollAndExchange(sourceToken);
    const prepared = await prepare(targetToken, source.browser);
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      const results = await Promise.all([
        switchContext(targetToken, source.browser, prepared.transition, first),
        switchContext(targetToken, source.browser, prepared.transition, second),
      ]);
      expect(results.sort()).toEqual(["RECOVERED", "SWITCHED"]);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
    expect(await resolve(source.browser)).toBe("INVALID_ACCESS");
    expect(await resolve(prepared.transition.browser)).toBe("OK:ACTIVE");
  });
});
