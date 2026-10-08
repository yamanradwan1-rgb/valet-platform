import { readdir } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertGuestAntiAbuseSchema } from "./guest-anti-abuse-schema-assertions.js";
import {
  applyMigration,
  createDisposableDatabase,
  dropDisposableDatabase,
} from "./guest-browser-session-test-fixture.js";

const firstT3Migration = "20261008007500_guest_t3_classified_anti_abuse";
const migrations = [
  firstT3Migration,
  "20261008007600_guest_t3_visit_budget_binding",
  "20261008007700_guest_t3_group_window_index",
];
const hash = `anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`;
let client: Client;
let databaseName = "";
let legacy: Record<string, unknown>;

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_guest_t3_migration");
  databaseName = database.databaseName;
  client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  const directories = (
    await readdir(new URL("../prisma/migrations/", import.meta.url), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory() && entry.name < firstT3Migration)
    .map((entry) => entry.name)
    .sort();
  expect(directories.at(-1)).toBe(
    "20261008007400_guest_browser_context_reconcile",
  );
  for (const directory of directories) await applyMigration(client, directory);
  legacy = (
    await client.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES ('v1:guest-token',$1,'PENDING') RETURNING *",
      [hash],
    )
  ).rows[0];
  for (const migration of migrations) await applyMigration(client, migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
}, 60_000);

async function constraint(
  operation: Promise<unknown>,
  code: string,
  name: string,
) {
  await expect(operation).rejects.toMatchObject({ code, constraint: name });
}

describe("T3 additive limiter migration invariants", () => {
  it("retains all original HMAC, timestamp, state and identity facts in the active window", async () => {
    const current = (
      await client.query("SELECT * FROM anti_abuse_events WHERE id=$1", [
        legacy.id,
      ])
    ).rows[0];
    expect(current).toEqual({
      ...legacy,
      request_class: null,
      group_key_hash: null,
    });
    await assertGuestAntiAbuseSchema(client, constraint);
  });

  it.each(["A", "B", "C", "D"])(
    "accepts only Guest class %s and an opaque visit group",
    async (requestClass) => {
      const row = (
        await client.query(
          "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class,group_key_hash) VALUES ('v1:guest-token',$1,'COUNTED',$2,$1) RETURNING request_class,group_key_hash",
          [hash, requestClass],
        )
      ).rows[0];
      expect(row).toEqual({
        request_class: requestClass,
        group_key_hash: hash,
      });
    },
  );

  it.each([
    [
      "v1:guest-token",
      "UNKNOWN",
      null,
      "anti_abuse_events_request_class_check",
    ],
    [
      "v1:staff-client-address",
      "A",
      null,
      "anti_abuse_events_request_class_check",
    ],
    [
      "v1:guest-token",
      null,
      "raw-visit-identifier",
      "anti_abuse_events_group_key_check",
    ],
    [
      "v1:staff-client-address",
      null,
      hash,
      "anti_abuse_events_group_key_check",
    ],
  ])(
    "rejects forbidden class/group representation %s %s %s",
    async (scope, requestClass, group, name) => {
      await constraint(
        client.query(
          "INSERT INTO anti_abuse_events(scope,key_hash,state,request_class,group_key_hash) VALUES ($1,$2,'COUNTED',$3,$4)",
          [scope, hash, requestClass, group],
        ),
        "23514",
        name!,
      );
    },
  );

  it("preserves every pre-T3 scope and confines the measured index to eligible opaque groups", async () => {
    const columns = await client.query(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='anti_abuse_events_scope_check'",
    );
    for (const scope of [
      "v1:staff-client-address",
      "v1:staff-login-identifier",
      "v1:handoff-issuance-session",
      "v1:handoff-verification-session",
      "v1:staff-activation-client-address",
      "v1:shift-presence-challenge-user",
      "v1:shift-presence-exception-user",
      "v1:shift-presence-status-user",
      "v1:guest-enrollment-address",
    ])
      expect(columns.rows[0].definition).toContain(scope);
    const index = await client.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname='anti_abuse_events_guest_group_window_idx'",
    );
    expect(index.rows[0].indexdef).toContain(
      "(scope, group_key_hash, occurred_at)",
    );
    expect(index.rows[0].indexdef).toContain("group_key_hash IS NOT NULL");
    expect(index.rows[0].indexdef).toContain("PENDING");
    expect(index.rows[0].indexdef).toContain("COUNTED");
    expect(index.rows[0].indexdef).not.toContain("clock_timestamp");
  });
});
