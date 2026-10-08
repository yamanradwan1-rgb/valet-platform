import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { ApplicationDrainState } from "../src/health/application-drain-state";
import { HealthReadinessService } from "../src/health/health-readiness.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";

const ready = () => ({
  rowCount: 1,
  rows: [{ anti_abuse_ready: true, guest_browser_ready: true }],
});

function serviceFor(
  query: ReturnType<typeof vi.fn>,
  drain = new ApplicationDrainState(),
) {
  return new HealthReadinessService(
    { query } as unknown as PostgresPool,
    drain,
    new AntiAbuseKeyDeriver(),
    new GuestAuthOriginPolicy(),
  );
}

describe("T4 API readiness concurrent work", () => {
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    GUEST_T3_RATE_POLICY: process.env.GUEST_T3_RATE_POLICY,
    ANTI_ABUSE_HMAC_SECRET_B64URL: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
  };
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.GUEST_T3_RATE_POLICY = "COMPATIBILITY";
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 7).toString(
      "base64url",
    );
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("coalesces 100 simultaneous real service checks into one database query", async () => {
    let complete!: (result: unknown) => void;
    const pending = new Promise((resolve) => {
      complete = resolve;
    });
    const query = vi.fn((sql: string) => {
      expect(sql).toMatch(/^SELECT\s/u);
      return pending;
    });
    const service = new HealthReadinessService(
      { query } as unknown as PostgresPool,
      new ApplicationDrainState(),
      new AntiAbuseKeyDeriver(),
      new GuestAuthOriginPolicy(),
    );
    const checks = Array.from({ length: 100 }, () => service.isReady());
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    complete({
      rowCount: 1,
      rows: [{ anti_abuse_ready: true, guest_browser_ready: true }],
    });
    expect(await Promise.all(checks)).toEqual(Array(100).fill(true));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/^SELECT\s/u);
  });

  it("does not cache success or poison future waves after failure", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ anti_abuse_ready: false, guest_browser_ready: true }],
      })
      .mockResolvedValueOnce(ready());
    const service = serviceFor(query);
    const first = await Promise.all(
      Array.from({ length: 100 }, () => service.isReady()),
    );
    const second = await Promise.all(
      Array.from({ length: 100 }, () => service.isReady()),
    );
    const third = await Promise.all(
      Array.from({ length: 100 }, () => service.isReady()),
    );
    expect(first).toEqual(Array(100).fill(true));
    expect(second).toEqual(Array(100).fill(false));
    expect(third).toEqual(Array(100).fill(true));
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("times out every shared waiter and allows a fresh healthy DB check", async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(ready());
    const service = serviceFor(query);
    const wave = Promise.all(
      Array.from({ length: 100 }, () => service.isReady()),
    );
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await wave).toEqual(Array(100).fill(false));
    expect(query).toHaveBeenCalledTimes(1);
    expect(await service.isReady()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("returns unavailable immediately during drain even if a shared prior query later succeeds", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const query = vi.fn(() => pending);
    const drain = new ApplicationDrainState();
    const service = serviceFor(query, drain);
    const wave = Promise.all(
      Array.from({ length: 100 }, () => service.isReady()),
    );
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    drain.beginDrain();
    expect(await service.isReady()).toBe(false);
    release(ready());
    expect(await wave).toEqual(Array(100).fill(false));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("validates config before and after an in-flight query, without Guest quota operations", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const query = vi.fn((sql: string) => {
      expect(sql).toMatch(/^SELECT\s/u);
      return pending;
    });
    const service = serviceFor(query);
    const first = service.isReady();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = "invalid";
    expect(await service.isReady()).toBe(false);
    release(ready());
    expect(await first).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    // Readiness never calls the Guest limiter, issues a session, or mutates DB.
    expect(String(query.mock.calls[0]?.[0])).toMatch(/^SELECT\s/u);
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 7).toString(
      "base64url",
    );
    expect(await serviceFor(vi.fn().mockResolvedValue(ready())).isReady()).toBe(
      true,
    );
  });

  it("caps a 200-request burst without starting a queue of database operations", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const query = vi.fn(() => pending);
    const service = serviceFor(query);
    const calls = Array.from({ length: 200 }, () => service.isReady());
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    release(ready());
    const results = await Promise.all(calls);
    expect(results.filter(Boolean)).toHaveLength(128);
    expect(results.filter((value) => !value)).toHaveLength(72);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
