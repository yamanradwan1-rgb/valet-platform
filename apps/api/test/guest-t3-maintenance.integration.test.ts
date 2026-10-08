import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { countClassifiedGuest } from "../src/modules/anti-abuse/classified-guest-counter";
import type { AntiAbuseKey } from "../src/modules/anti-abuse/anti-abuse-key";
import { ShiftTestContext } from "./shift-test-context";
import { AntiAbuseMaintenance } from "../src/modules/anti-abuse/anti-abuse-maintenance";

describe("T3 bounded maintenance, migration preservation and full-key isolation", () => {
  const context = new ShiftTestContext("t3_maintenance");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);
  const key: AntiAbuseKey = {
    keyHash: `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`,
    lockHigh: 700075,
    lockLow: 2,
    scope: "v1:guest-token",
  };

  it("counts historical NULL classes conservatively and preserves the exact boundary", async () => {
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES ($1,$2,'COUNTED')",
      [key.scope, key.keyHash],
    );
    const blocked = await inPostgresTransaction(
      context.runtimePool,
      (transaction) => countClassifiedGuest(transaction, key, "C", 1, 2),
    );
    expect(blocked.id).toBeUndefined();
    expect(blocked.retryAfter).toBeGreaterThan(0);
    await context.adminPool.query(
      "UPDATE anti_abuse_events SET occurred_at=clock_timestamp()-interval '901 seconds'",
    );
    expect(
      (
        await inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, key, "C", 1, 2),
        )
      ).id,
    ).toBeDefined();
  });

  it("never combines counters under a deliberately colliding advisory prefix", async () => {
    const collision = {
      ...key,
      keyHash: `anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`,
    };
    const decisions = await Promise.all(
      [key, collision].map((value) =>
        inPostgresTransaction(context.runtimePool, (transaction) =>
          countClassifiedGuest(transaction, value, "A", 2, 3),
        ),
      ),
    );
    expect(decisions.every((decision) => decision.id !== undefined)).toBe(true);
  });

  it("limits each batch to 1000, skips live row locks, converges and preserves protected events", async () => {
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,occurred_at) SELECT $1,$2,'IGNORED',clock_timestamp()-interval '2 hours' FROM generate_series(1,2501)",
      [key.scope, key.keyHash],
    );
    const holder = await context.adminPool.connect();
    await holder.query("BEGIN");
    await holder.query(
      "SELECT id FROM anti_abuse_events WHERE occurred_at < clock_timestamp()-interval '1 hour' ORDER BY occurred_at LIMIT 1 FOR UPDATE",
    );
    const cleanupLatencies: number[] = [];
    const cleanup = async () => {
      const started = performance.now();
      const result = await context.runtimePool.query(
        "SELECT cleanup_expired_anti_abuse_events() AS deleted",
      );
      cleanupLatencies.push(performance.now() - started);
      return result.rows[0].deleted as number;
    };
    try {
      const first = await Promise.all([cleanup(), cleanup()]);
      expect(first.every((deleted) => deleted >= 0 && deleted <= 1000)).toBe(
        true,
      );
      for (let attempt = 0; attempt < 4; attempt += 1) await cleanup();
      expect(
        (
          await context.adminPool.query(
            "SELECT count(*)::int AS count FROM anti_abuse_events WHERE occurred_at < clock_timestamp()-interval '1 hour'",
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    expect(await cleanup()).toBe(1);
    expect(
      (
        await context.adminPool.query(
          "SELECT count(*)::int AS count FROM anti_abuse_events WHERE occurred_at > clock_timestamp()-interval '15 minutes'",
        )
      ).rows[0].count,
    ).toBe(3);
    cleanupLatencies.sort((a, b) => a - b);
    const directory = resolve(process.cwd(), "../../tmp/guest-t3-evidence");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, "maintenance.json"),
      JSON.stringify(
        {
          expiredRows: 2501,
          preservedCurrentRows: 3,
          batchBound: 1000,
          concurrentWorkers: 2,
          heldExpiredRows: 1,
          backlogAfterUnlock: 0,
          samples: cleanupLatencies.length,
          p50Ms: cleanupLatencies[Math.ceil(cleanupLatencies.length * 0.5) - 1],
          observedP99Ms: cleanupLatencies.at(-1),
          evidence:
            "small owned local batch/lock fixture; not retention soak qualification",
        },
        null,
        2,
      ),
    );
  });

  it("keeps fixed SECURITY DEFINER ownership and denies broad runtime deletion/PUBLIC execute", async () => {
    for (const sql of [
      "DELETE FROM anti_abuse_events",
      "TRUNCATE anti_abuse_events",
    ]) {
      await expect(context.runtimePool.query(sql)).rejects.toMatchObject({
        code: "42501",
      });
    }
    const safety = await context.adminPool.query(
      `SELECT p.prosecdef, p.proowner <> r.oid AS non_runtime_owner,
        p.proconfig, NOT EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
        ) AS public_denied FROM pg_proc p CROSS JOIN pg_roles r
        WHERE p.oid='public.cleanup_expired_anti_abuse_events()'::regprocedure AND r.rolname=$1`,
      [context.runtimeRole],
    );
    expect(safety.rows[0]).toMatchObject({
      prosecdef: true,
      non_runtime_owner: true,
      public_denied: true,
    });
    expect(safety.rows[0].proconfig).toContain(
      "search_path=pg_catalog, public",
    );
    await expect(
      context.runtimePool.query(
        "SELECT cleanup_expired_anti_abuse_events(clock_timestamp())",
      ),
    ).rejects.toMatchObject({ code: "42883" });
  });

  it("bounds overlapping worker requests and reports retention backlog without identifying labels", async () => {
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state,occurred_at) SELECT $1,$2,'IGNORED',clock_timestamp()-interval '2 hours' FROM generate_series(1,1500)",
      [key.scope, key.keyHash],
    );
    const worker = new AntiAbuseMaintenance(context.runtimePool);
    await Promise.all([worker.run(), worker.run()]);
    expect(worker.measurements).toMatchObject({
      runs: 1,
      deleted: 1000,
      failures: 0,
      expiredSample: 500,
    });
    expect(worker.measurements.oldestExpiredAgeSeconds).toBeGreaterThanOrEqual(
      7200,
    );
    await worker.run();
    expect(worker.measurements).toMatchObject({
      runs: 2,
      deleted: 1500,
      failures: 0,
      expiredSample: 0,
      oldestExpiredAgeSeconds: 0,
    });
    await worker.onModuleDestroy();
  });
});
