import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { withCommittedPhotoDeliveryFence } from "../src/modules/dashboard/session-photo-delivery-fence";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function mockPool(commitFails = false, beginFails = false) {
  const log: string[] = [];
  const releases: Array<boolean | undefined> = [];
  let leases = 0;
  const pool = {
    connect: vi.fn(async () => {
      const index = ++leases;
      return {
        query: async (sql: string) => {
          log.push(`${index}:${sql}`);
          if (index === 1 && beginFails && sql.startsWith("BEGIN")) {
            throw new Error("witness BEGIN 08006");
          }
          if (index === 2 && commitFails && sql === "COMMIT") {
            throw new Error("ambiguous COMMIT 08006");
          }
          if (sql === "SELECT 1 AS alive") {
            return {rows:[{alive:1}],rowCount:1};
          }
          return { rows: [], rowCount: 0 };
        },
        release: (destroy?: boolean) => { releases[index - 1] = destroy; },
      };
    }),
  };
  return { pool: pool as unknown as PostgresPool, log, releases, connect: pool.connect };
}

async function httpCase(commitFails: boolean) {
  const db = mockPool(commitFails);
  const sends = vi.fn();
  let requestComplete!: () => void;
  const completed = new Promise<void>((resolve) => { requestComplete = resolve; });
  const server = createServer((_incoming, response) => {
    void withCommittedPhotoDeliveryFence(db.pool, async (witness) => {
      await witness.query("SELECT authorized_witness_row_locks");
    }, () => {
      if (response.destroyed || response.writableEnded) {
        throw new Error("closed before photo enqueue");
      }
      sends();
      response.setHeader("Content-Type", "image/jpeg");
      response.end(jpeg);
    }).catch(() => {
      if (!response.destroyed && !response.headersSent) {
        response.statusCode = 503;
        response.end("unavailable");
      }
    }).finally(requestComplete);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { db, sends, completed, port,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("Issue #309 committed photo delivery fence over Node HTTP", () => {
  it("requires an acknowledged COMMIT after locked authorization before JPEG", async () => {
    const h = await httpCase(false);
    try {
      const response = await fetch(`http://127.0.0.1:${h.port}/`);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);
      await h.completed;
      expect(h.sends).toHaveBeenCalledOnce();
      const log = h.db.log;
      expect(log.indexOf("1:SELECT authorized_witness_row_locks"))
        .toBeLessThan(log.indexOf("2:COMMIT"));
      expect(log.indexOf("2:COMMIT")).toBeLessThan(log.indexOf("1:ROLLBACK"));
      expect(h.db.connect).toHaveBeenCalledTimes(2);
      expect(h.db.releases).toEqual([false, false]);
    } finally { await h.stop(); }
  });

  it("never sends JPEG when COMMIT fails, destroys ambiguous ACK connection", async () => {
    const h = await httpCase(true);
    try {
      const response = await fetch(`http://127.0.0.1:${h.port}/`);
      expect(response.status).toBe(503);
      expect(await response.text()).toBe("unavailable");
      await h.completed;
      expect(h.sends).not.toHaveBeenCalled();
      expect(h.db.releases).toEqual([false, true]);
      expect(h.db.log).not.toContain("2:ROLLBACK");
    } finally { await h.stop(); }
  });

  it("failed witness BEGIN never opens ACK or enqueues JPEG", async () => {
    const h = mockPool(false, true);
    const send = vi.fn();
    await expect(withCommittedPhotoDeliveryFence(h.pool, async () => {}, send))
      .rejects.toThrow("witness BEGIN 08006");
    expect(send).not.toHaveBeenCalled();
    expect(h.releases).toEqual([true, false]);
  });

});
