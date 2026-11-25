import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { withStaffPushFixtureGuardsDisabled } from "./staff-push-fixture-guard";

const db = new RetrievalPushTestContext("guard_rollback");

beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

async function currentGuardState() {
  const result = await db.adminPool.query<{ tgenabled: string }>(
    `SELECT t.tgenabled
     FROM pg_trigger AS t
     JOIN pg_class AS c ON c.oid = t.tgrelid
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname = 'staff_push_intents'
       AND t.tgname = 'staff_push_intent_immutable_guard_trigger'`,
  );
  return result.rows[0]?.tgenabled;
}

describe("Staff Push historical fixture guard restores production trigger", () => {
  it("rejects a different disposable database even when table owner is the same", async () => {
    let executed = false;
    await expect(
      withStaffPushFixtureGuardsDisabled(
        db.adminPool,
        db.databaseName + "_different",
        ["staff_push_intents"],
        async () => {
          executed = true;
        },
      ),
    ).rejects.toThrow("disposable fixture database");
    expect(executed).toBe(false);
    expect(await currentGuardState()).toBe("O");
  });

  it("rolls back a historical timestamp and leaves the immutable guard active", async () => {
    const fixture = await db.createGuestParkedFixture();
    await db.addRegistration(fixture.userId);
    await db.request(fixture);
    const before = await db.adminPool.query<{ id: string; expires_at: Date }>(
      "SELECT id, expires_at FROM staff_push_intents WHERE valet_session_id = $1",
      [fixture.sessionId],
    );
    const intent = before.rows[0]!;
    await expect(
      withStaffPushFixtureGuardsDisabled(
        db.adminPool,
        db.databaseName,
        ["staff_push_intents"],
        async (client) => {
          await client.query(
            "UPDATE staff_push_intents SET expires_at = expires_at + interval '1 minute' WHERE id = $1",
            [intent.id],
          );
          throw new Error("deliberate fixture rollback");
        },
      ),
    ).rejects.toThrow("deliberate fixture rollback");
    const after = await db.adminPool.query<{ expires_at: Date }>(
      "SELECT expires_at FROM staff_push_intents WHERE id = $1",
      [intent.id],
    );
    expect(after.rows[0]?.expires_at).toEqual(intent.expires_at);
    expect(await currentGuardState()).toBe("O");
    await expect(
      db.adminPool.query(
        "UPDATE staff_push_intents SET expires_at = expires_at + interval '1 minute' WHERE id = $1",
        [intent.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
