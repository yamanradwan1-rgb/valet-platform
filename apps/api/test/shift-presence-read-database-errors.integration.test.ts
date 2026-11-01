import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { observePresenceCommandWait } from "./shift-presence-commit-test-helper";
import { presenceReadProbe } from "./shift-presence-read-probe";

const db = new PresenceServerTestContext("issue406-database-origins");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

describe("Issue 406: real PostgreSQL origins are distinct from advisory refusal", () => {
  it("55P03 is a real row-lock timeout, without advisory refusal", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const holder = await db.adminPool.connect();
    const probe = presenceReadProbe(db.runtimePool, 150);
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM locations WHERE id=$1 FOR UPDATE", [
        f.locationId,
      ]);
      await expect(
        new PresenceManagementService(probe.pool).location(a.context, a.target),
      ).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
        origin: "POSTGRES_LOCK_NOT_AVAILABLE_55P03",
      });
      expect(probe.errors).toEqual(["55P03"]);
      expect(probe.statements.filter((sql) => sql === "BEGIN")).toHaveLength(1);
      expect(probe.statements.at(-1)).toBe("ROLLBACK");
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  });

  it("40P01 is a real deadlock with a deliberately inverted external transaction", async () => {
    const f = await db.createFixture();
    const a = await db.manager(f);
    const holder = await db.adminPool.connect();
    const probe = presenceReadProbe(db.runtimePool, 3000);
    let read: Promise<unknown> | undefined;
    let competing: Promise<unknown> | undefined;
    try {
      await holder.query("BEGIN");
      // Only this disposable test's admin connection inverts the production graph.
      // Delay its detector so the application's waiting statement detects the cycle.
      await holder.query("SET LOCAL deadlock_timeout = '10s'");
      await holder.query("SELECT id FROM locations WHERE id=$1 FOR UPDATE", [
        f.locationId,
      ]);
      read = new PresenceManagementService(probe.pool)
        .location(a.context, a.target)
        .catch((error) => error);
      await observePresenceCommandWait(db);
      competing = holder.query(
        "UPDATE organizations SET name=name WHERE id=$1",
        [f.organizationId],
      );
      expect(await read).toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
        origin: "POSTGRES_DEADLOCK_40P01",
      });
      await competing;
      expect(probe.errors).toEqual(["40P01"]);
      expect(probe.statements.filter((sql) => sql === "BEGIN")).toHaveLength(1);
      expect(probe.statements.at(-1)).toBe("ROLLBACK");
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
      await read;
      await competing;
    }
  });
});
