import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { RuntimeDatabaseUnavailableError } from "../src/common/database/runtime-database-deadline";
import { createHttpMetricsMiddleware } from "../src/common/observability/http-metrics.middleware";
import { HealthController } from "../src/health/health.controller";
import { HealthReadinessService } from "../src/health/health-readiness.service";
import { ApplicationDrainState } from "../src/health/application-drain-state";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import type { ApiRequest } from "../src/common/http/api-request";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("GUEST_T3_RATE_POLICY", "COMPATIBILITY");
  vi.stubEnv(
    "ANTI_ABUSE_HMAC_SECRET_B64URL",
    Buffer.alloc(32, 17).toString("base64url"),
  );
});
afterEach(() => vi.unstubAllEnvs());

function fixture(query: ReturnType<typeof vi.fn>) {
  const drain = new ApplicationDrainState();
  const pool = { query } as unknown as PostgresPool;
  const service = new HealthReadinessService(
    pool,
    drain,
    new AntiAbuseKeyDeriver(),
    new GuestAuthOriginPolicy(),
  );
  return { service, controller: new HealthController(service), drain };
}

function loggedRequest() {
  const lines: string[] = [];
  const request = {
    method: "GET",
    url: "/health/ready?private=must-not-log",
    headers: {
      authorization: "Bearer must-not-log",
      "x-request-id": "health-probe",
    },
  };
  const reply = Object.assign(new EventEmitter(), {
    statusCode: 503,
    writableFinished: true,
  });
  createHttpMetricsMiddleware((line) => lines.push(line))(
    request as unknown as IncomingMessage,
    reply as unknown as ServerResponse,
    () => {},
  );
  return { request: request as ApiRequest, reply, lines };
}

describe("private readiness pool-failure attribution", () => {
  it("attributes each coalesced 503 without changing the public response or doing another DB check", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new RuntimeDatabaseUnavailableError("QUEUE_FULL"));
    const { controller } = fixture(query);
    const first = loggedRequest();
    const second = loggedRequest();
    const results = await Promise.all(
      [first, second].map(async (item) => {
        try {
          await controller.ready(item.request);
          throw new Error("expected unavailable");
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          expect((error as HttpException).getStatus()).toBe(503);
          expect((error as HttpException).getResponse()).toEqual({
            status: "unavailable",
          });
          item.reply.emit("finish");
          return item.lines;
        }
      }),
    );
    expect(query).toHaveBeenCalledTimes(1);
    for (const lines of results) {
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("route=/health/ready");
      expect(lines[0]).toContain("reason=QUEUE_FULL");
      expect(lines[0]).not.toContain("must-not-log");
    }
  });
  it.each([
    [
      "ACQUISITION_TIMEOUT",
      new RuntimeDatabaseUnavailableError("ACQUISITION_TIMEOUT"),
    ],
    ["CONNECT_ERROR", new RuntimeDatabaseUnavailableError("CONNECT_ERROR")],
    ["QUERY_TIMEOUT", new RuntimeDatabaseUnavailableError("QUERY_TIMEOUT")],
    ["LOCK_TIMEOUT", { code: "55P03" }],
    ["TRANSACTION_TIMEOUT", { code: "25P04" }],
    ["QUERY_CANCELED", { code: "57014" }],
  ])("preserves %s in private readiness diagnostics", async (reason, error) => {
    const { controller } = fixture(vi.fn().mockRejectedValue(error));
    const item = loggedRequest();
    await expect(controller.ready(item.request)).rejects.toBeInstanceOf(
      HttpException,
    );
    item.reply.emit("finish");
    expect(item.lines[0]).toContain(`reason=${reason}`);
  });

  it("distinguishes draining from database admission and never queries the pool", async () => {
    const query = vi.fn();
    const { controller, drain } = fixture(query);
    drain.beginDrain();
    const item = loggedRequest();
    await expect(controller.ready(item.request)).rejects.toBeInstanceOf(
      HttpException,
    );
    item.reply.emit("finish");
    expect(item.lines[0]).toContain("reason=DRAINING");
    expect(query).not.toHaveBeenCalled();
  });

  it("retains the separate 128-waiter readiness bound and coalesces accepted checks", async () => {
    let finish!: (value: unknown) => void;
    const query = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { controller } = fixture(query);
    const requests = Array.from({ length: 130 }, () => loggedRequest());
    const outcomes = requests.map((item) =>
      controller.ready(item.request).catch((error: unknown) => error),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    finish({
      rowCount: 1,
      rows: [{ anti_abuse_ready: true, guest_browser_ready: true }],
    });
    const results = await Promise.all(outcomes);
    expect(
      results.filter((item) => item instanceof HttpException),
    ).toHaveLength(2);
    for (const item of requests.slice(128)) {
      item.reply.emit("finish");
      expect(item.lines[0]).toContain("reason=READINESS_QUEUE_FULL");
    }
  });
});
