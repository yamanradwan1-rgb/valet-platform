import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { WebPushDeliveryWorker } from "../src/modules/web-push-delivery/web-push-delivery-worker";

const enabledConfig = {
  enabled: true as const,
  storageKeys: {
    active: { key: Buffer.alloc(32, 1), version: "active" },
  },
  vapid: {
    privateKey: "private",
    publicKey: "public",
    subject: "mailto:push@example.test",
  },
};

afterEach(() => vi.useRealTimers());

describe("Web Push delivery worker lifecycle", () => {
  it("does no work while Web Push is disabled", async () => {
    const query = vi.fn();
    const worker = new WebPushDeliveryWorker(
      { query } as unknown as PostgresPool,
      { enabled: false },
      { send: vi.fn() },
    );
    worker.onApplicationBootstrap();
    await worker.onApplicationShutdown();
    expect(query).not.toHaveBeenCalled();
  });

  it("does not overlap local cycles and waits for clean shutdown", async () => {
    vi.useFakeTimers();
    let releaseFirst!: () => void;
    const firstQuery = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const query = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstQuery;
        return { rowCount: 1, rows: [{ inserted: 0 }] };
      })
      .mockResolvedValue({ rowCount: 0, rows: [] });
    const worker = new WebPushDeliveryWorker(
      { query } as unknown as PostgresPool,
      enabledConfig,
      { send: vi.fn() },
    );
    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(query).toHaveBeenCalledTimes(1);
    const shutdown = worker.onApplicationShutdown();
    let stopped = false;
    void shutdown.then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(stopped).toBe(false);
    releaseFirst();
    await shutdown;
    expect(query).toHaveBeenCalledTimes(5);
  });
});
