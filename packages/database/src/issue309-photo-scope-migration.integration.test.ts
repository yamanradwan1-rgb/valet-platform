import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
} from "./guest-browser-session-test-fixture.js";

const migration = "20261021009800_issue309_photo_view_anti_abuse_scope";
const previous = "20261015008100_issue_215_photo_anti_abuse_scopes";
const newScope = "v1:dashboard-session-photo-view-user";
const hash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
const priorScopes = [
  "v1:staff-login-identifier", "v1:staff-client-address",
  "v1:guest-client-address", "v1:guest-token", "v1:guest-enrollment-address",
  "v1:handoff-issuance-session", "v1:handoff-verification-session",
  "v1:mfa-totp-user", "v1:mfa-recovery-user",
  "v1:staff-onboarding-create-organization", "v1:staff-onboarding-resend-membership",
  "v1:staff-activation-credential", "v1:staff-activation-client-address",
  "v1:shift-presence-challenge-user", "v1:shift-presence-exception-user",
  "v1:shift-presence-status-user",
  "v1:condition-photo-upload-user", "v1:condition-photo-upload-session",
  "v1:condition-photo-status-user",
] as const;

let name = "";
let client: Client;
let originalRows: unknown[];

beforeAll(async () => {
  const db = await createDisposableDatabase("vlt_309_photo_scope");
  name = db.databaseName;
  client = new Client({ connectionString: db.databaseUrl });
  await client.connect();
  // Real predecessor SQL, including the original state/HMAC integrity checks.
  await applyMigration(client, "20260810001800_shared_durable_anti_abuse");
  await applyMigration(client, previous);
  await client.query(
    `INSERT INTO public.anti_abuse_events(scope,key_hash,state)
     VALUES ('v1:guest-token',$1,'COUNTED'),
            ('v1:condition-photo-status-user',$1,'PENDING')`,
    [hash],
  );
  originalRows = (await client.query(
    "SELECT * FROM public.anti_abuse_events ORDER BY scope",
  )).rows;
}, 60_000);

afterAll(async () => {
  try { await client?.end(); }
  finally { if (name) await dropDisposableDatabase(name); }
}, 30_000);

describe("#309 photo-view budget scope forward migration (PostgreSQL)", () => {
  it("refuses a drifted predecessor and rolls back without losing existing events", async () => {
    await client.query(
      `ALTER TABLE public.anti_abuse_events DROP CONSTRAINT anti_abuse_events_scope_check;
       ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_scope_check
         CHECK (scope IN ('v1:guest-token', 'v1:condition-photo-status-user'))`,
    );
    try {
      await expect(applyMigration(client, migration)).rejects.toMatchObject({ code: "55000" });
    } finally {
      await client.query("ROLLBACK");
    }
    const constraint = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid='public.anti_abuse_events'::regclass
         AND conname='anti_abuse_events_scope_check'`,
    );
    expect(constraint.rows[0]?.definition).toContain("v1:guest-token");
    expect(constraint.rows[0]?.definition).not.toContain(newScope);
    expect((await client.query("SELECT * FROM public.anti_abuse_events ORDER BY scope")).rows)
      .toEqual(originalRows);
    await applyMigration(client, previous);
  });

  it("admits exactly the new scope and every previously permitted scope without row mutation", async () => {
    await applyMigration(client, migration);
    expect((await client.query("SELECT * FROM public.anti_abuse_events ORDER BY scope")).rows)
      .toEqual(originalRows);
    for (const scope of [...priorScopes, newScope]) {
      await expect(client.query(
        "INSERT INTO public.anti_abuse_events(scope,key_hash,state) VALUES($1,$2,'COUNTED')",
        [scope, hash],
      )).resolves.toMatchObject({ rowCount: 1 });
    }
    const expected = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid='public.anti_abuse_events'::regclass
         AND conname='anti_abuse_events_scope_check'`,
    );
    expect(expected.rows[0]?.definition).toContain(newScope);
  });

  it("still rejects unknown scopes, invalid states and plaintext/invalid HMAC keys", async () => {
    for (const [scope, keyHash, state, constraint] of [
      ["v1:dashboard-session-photo-unknown", hash, "COUNTED", "anti_abuse_events_scope_check"],
      [newScope, "plaintext-user-id", "COUNTED", "anti_abuse_events_key_hash_check"],
      [newScope, hash, "UNBOUNDED", "anti_abuse_events_state_check"],
    ]) {
      await expect(client.query(
        "INSERT INTO public.anti_abuse_events(scope,key_hash,state) VALUES($1,$2,$3)",
        [scope, keyHash, state],
      )).rejects.toMatchObject({ code: "23514", constraint });
    }
  });
});
