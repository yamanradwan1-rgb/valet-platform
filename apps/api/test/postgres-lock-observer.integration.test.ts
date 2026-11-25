import { randomBytes } from "node:crypto";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { ShiftTestContext } from "./shift-test-context";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";

describe("PostgreSQL lock observer across restricted roles", () => {
  it("proves the actual writer's advisory-lock wait behind a different role", async () => {
    const db = new ShiftTestContext("cross_role_blocking_edge");
    const key = BigInt("0x" + randomBytes(7).toString("hex")).toString();
    let blocker: PoolClient | undefined;
    let waiter: PoolClient | undefined;
    let blocked: Promise<unknown> | undefined;
    try {
      await db.setup();
      blocker = await db.adminPool.connect();
      waiter = await db.runtimePool.connect();
      const [owner, subject] = await Promise.all([
        blocker.query<{ pid: number; role: string }>(
          "SELECT pg_backend_pid() AS pid, current_user AS role",
        ),
        waiter.query<{ pid: number; role: string }>(
          "SELECT pg_backend_pid() AS pid, current_user AS role",
        ),
      ]);
      expect(owner.rows[0]?.role).not.toBe(subject.rows[0]?.role);
      expect(subject.rows[0]?.role).toBe(db.runtimeRole);
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
      blocked = waiter.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
      void blocked.catch(() => undefined);
      expect(
        await waitForPostgresBlockingEdge(db.adminPool, {
          blockerPid: owner.rows[0]!.pid,
          waiterPid: subject.rows[0]!.pid,
        }),
      ).toEqual([subject.rows[0]!.pid]);
      await blocker.query("ROLLBACK");
      await blocked;
    } finally {
      await blocker?.query("ROLLBACK").catch(() => undefined);
      blocker?.release();
      await blocked?.catch(() => undefined);
      waiter?.release();
      await db.teardown();
    }
  }, 120_000);
});
