import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { verifyRuntimeDatabaseReadiness } from "../src/common/database/runtime-database-readiness";
import { RuntimeDatabaseUnavailableError } from "../src/common/database/runtime-database-deadline";
import { createApplicationDrainMiddleware } from "../src/health/application-drain-middleware";
import { ApplicationDrainState } from "../src/health/application-drain-state";
import { armEarlyShutdownWithdrawal } from "../src/health/early-shutdown-withdrawal";
import { HealthController } from "../src/health/health.controller";
import { HealthReadinessService } from "../src/health/health-readiness.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";

class TestResponse extends EventEmitter {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  body = "";

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  end(body = ""): this {
    this.body = body;
    this.emit("finish");
    return this;
  }
}

function request(url: string): IncomingMessage {
  return { url } as IncomingMessage;
}

function response(): { raw: ServerResponse; test: TestResponse } {
  const test = new TestResponse();
  return { raw: test as unknown as ServerResponse, test };
}

function readyPool(ready = true): PostgresPool {
  return {
    query: vi.fn(async () => ({
      command: "SELECT",
      fields: [],
      oid: 0,
      rowCount: 1,
      rows: [{ anti_abuse_ready: ready, guest_browser_ready: ready }],
    })),
  } as unknown as PostgresPool;
}

describe("Guest T4 health and drain boundary", () => {
  const originalEnvironment = {
    ANTI_ABUSE_HMAC_SECRET_B64URL: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
    GUEST_AUTH_ALLOWED_ORIGINS: process.env.GUEST_AUTH_ALLOWED_ORIGINS,
    GUEST_T3_RATE_POLICY: process.env.GUEST_T3_RATE_POLICY,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.GUEST_T3_RATE_POLICY = "COMPATIBILITY";
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 7).toString(
      "base64url",
    );
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps liveness independent from readiness evaluation", () => {
    const isReady = vi.fn(async () => {
      throw new Error("must not run");
    });
    const controller = new HealthController({
      isReady,
    } as unknown as HealthReadinessService);

    expect(controller.live()).toEqual({ status: "ok" });
    expect(isReady).not.toHaveBeenCalled();
  });

  it("returns only a generic unavailable readiness response", async () => {
    const controller = new HealthController({
      isReady: vi.fn(async () => false),
    } as unknown as HealthReadinessService);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("fences new application requests during drain but leaves health probes reachable", () => {
    const state = new ApplicationDrainState();
    const middleware = createApplicationDrainMiddleware(state);
    state.beginDrain();

    const blocked = response();
    const blockedNext = vi.fn();
    middleware(request("/v1/guest/session"), blocked.raw, blockedNext);
    expect(blocked.test.statusCode).toBe(503);
    expect(JSON.parse(blocked.test.body)).toEqual({ status: "unavailable" });
    expect(blockedNext).not.toHaveBeenCalled();

    const health = response();
    const healthNext = vi.fn();
    middleware(request("/health/ready?probe=1"), health.raw, healthNext);
    expect(healthNext).toHaveBeenCalledTimes(1);
  });

  it("tracks in-flight requests and resolves drain only after completion", async () => {
    const state = new ApplicationDrainState();
    const middleware = createApplicationDrainMiddleware(state);
    const active = response();
    middleware(request("/v1/guest/session"), active.raw, vi.fn());
    expect(state.activeRequests()).toBe(1);

    state.beginDrain();
    const idle = state.waitForIdle(100);
    active.test.emit("finish");
    active.test.emit("close");

    await expect(idle).resolves.toBe(true);
    expect(state.activeRequests()).toBe(0);
  });

  it("bounds drain waiting when an in-flight request does not finish", async () => {
    vi.useFakeTimers();
    const state = new ApplicationDrainState();
    expect(state.tryBeginRequest()).toBeTypeOf("function");
    state.beginDrain();

    const idle = state.waitForIdle(250);
    await vi.advanceTimersByTimeAsync(250);

    await expect(idle).resolves.toBe(false);
    expect(state.activeRequests()).toBe(1);
  });

  it("requires valid config, database capabilities, and a non-draining process", async () => {
    const pool = readyPool();
    const drain = new ApplicationDrainState();
    const service = new HealthReadinessService(
      pool,
      drain,
      new AntiAbuseKeyDeriver(),
      new GuestAuthOriginPolicy(),
    );

    await expect(service.isReady()).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);

    drain.beginDrain();
    await expect(service.isReady()).resolves.toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("fails closed if drain begins while the dependency probe is in flight", async () => {
    let resolveQuery!: (value: unknown) => void;
    const query = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );
    const pool = { query } as unknown as PostgresPool;
    const drain = new ApplicationDrainState();
    const service = new HealthReadinessService(
      pool,
      drain,
      new AntiAbuseKeyDeriver(),
      new GuestAuthOriginPolicy(),
    );

    const readiness = service.isReady();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    drain.beginDrain();
    resolveQuery({
      rowCount: 1,
      rows: [{ anti_abuse_ready: true, guest_browser_ready: true }],
    });

    await expect(readiness).resolves.toBe(false);
  });

  it("fails readiness before touching the database when anti-abuse config is invalid", async () => {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = "invalid";
    const pool = readyPool();
    const service = new HealthReadinessService(
      pool,
      new ApplicationDrainState(),
      new AntiAbuseKeyDeriver(),
      new GuestAuthOriginPolicy(),
    );

    await expect(service.isReady()).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("fails production readiness closed when the Guest auth origin is missing", async () => {
    process.env.NODE_ENV = "production";
    const pool = readyPool();
    const service = new HealthReadinessService(
      pool,
      new ApplicationDrainState(),
      new AntiAbuseKeyDeriver(),
      new GuestAuthOriginPolicy(),
    );

    await expect(service.isReady()).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("maps missing database capability to unavailable without mutating state", async () => {
    await expect(
      verifyRuntimeDatabaseReadiness(readyPool(false)),
    ).rejects.toBeInstanceOf(RuntimeDatabaseUnavailableError);
  });

  it("bounds an unresponsive database readiness probe", async () => {
    vi.useFakeTimers();
    const query = vi.fn(() => new Promise(() => undefined));
    const readiness = verifyRuntimeDatabaseReadiness({
      query,
    } as unknown as PostgresPool);
    const rejected = expect(readiness).rejects.toBeInstanceOf(
      RuntimeDatabaseUnavailableError,
    );

    await vi.advanceTimersByTimeAsync(2_500);

    await rejected;
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("withdraws readiness synchronously before Nest SIGTERM hooks or public app.close", async () => {
    const state = new ApplicationDrainState();
    const signalSource = new EventEmitter();
    const seenAtNestSignal = vi.fn(() => state.isDraining());
    signalSource.on("SIGTERM", seenAtNestSignal); // Installed by Nest first.
    const close = vi.fn(async () => {
      expect(state.isDraining()).toBe(true);
    });
    const application = { close };
    armEarlyShutdownWithdrawal(application, state, signalSource);
    signalSource.emit("SIGTERM");
    expect(seenAtNestSignal).toHaveReturnedWith(true);
    expect(signalSource.listenerCount("SIGTERM")).toBe(1); // Only Nest's original listener remains.
    await application.close();
    expect(close).toHaveBeenCalledTimes(1);

    const direct = new ApplicationDrainState();
    const directClose = vi.fn(async () =>
      expect(direct.isDraining()).toBe(true),
    );
    const another = { close: directClose };
    armEarlyShutdownWithdrawal(another, direct, new EventEmitter());
    await another.close();
    expect(direct.isDraining()).toBe(true);
  });
});
