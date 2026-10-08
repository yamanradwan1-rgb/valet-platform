import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { RuntimeDatabaseModule } from "../src/common/database/runtime-database.module";
import { ObservabilityModule } from "../src/common/observability/observability.module";
import { HealthModule } from "../src/health/health.module";
import {
  formatGuestOperationMetric,
  guestErrorClass,
} from "../src/common/observability/guest-operation-metrics";
import { createHttpMetricsMiddleware } from "../src/common/observability/http-metrics.middleware";
import {
  buildHttpMetric,
  classifyHttpOperation,
  formatHttpMetric,
} from "../src/common/observability/http-operation-metrics";
import {
  readLimiterMaintenanceSnapshot,
  recordLimiterMaintenanceSnapshot,
} from "../src/common/observability/limiter-maintenance-metrics";
import {
  formatRuntimeMetrics,
  readRuntimeMetrics,
} from "../src/common/observability/runtime-metrics-pulse";
import { RuntimeMetricsPulse } from "../src/common/observability/runtime-metrics-pulse";
import type { PostgresPool } from "../src/common/database/postgres";

describe("T4 privacy-bounded operational telemetry", () => {
  it("does not instantiate a real runtime DB pool in shared HTTP observer test modules", () => {
    const observerImports = (Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ObservabilityModule,
    ) ?? []) as unknown[];
    const healthProviders = (Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      HealthModule,
    ) ?? []) as unknown[];
    expect(observerImports).not.toContain(RuntimeDatabaseModule);
    expect(healthProviders).toContain(RuntimeMetricsPulse);
  });
  it("never uses query strings, token-bearing paths or arbitrary methods as labels", () => {
    const secret = "secret-bearing-credential-123";
    expect(
      classifyHttpOperation(
        "GET",
        `/v1/guest/sessions/${secret}?bearer=${secret}`,
      ),
    ).toBe("GUEST_READ");
    expect(classifyHttpOperation("POST", `/v1/guest/${secret}`)).toBe(
      "GUEST_MUTATION",
    );
    expect(classifyHttpOperation("GET", `/api/other/${secret}`)).toBe("OTHER");
    const line = formatHttpMetric(buildHttpMetric("GUEST_READ", 429, 12.4));
    expect(line).toBe(
      "HTTP_METRIC operation=GUEST_READ outcome=RATE_LIMITED status=429 durationMs=12",
    );
    expect(line).not.toContain(secret);
  });

  it("records final response status including guard/exception failures, never raw credential URLs", () => {
    const logs: string[] = [];
    const middleware = createHttpMetricsMiddleware((line) => logs.push(line));
    const simulate = (path: string, method: string, status: number) => {
      const reply = Object.assign(new EventEmitter(), {
        statusCode: 200,
        writableFinished: false,
      });
      const next = vi.fn();
      middleware(
        { method, url: path } as IncomingMessage,
        reply as unknown as ServerResponse,
        next,
      );
      expect(next).toHaveBeenCalledTimes(1);
      reply.statusCode = status; // Applied later by a guard/filter, not the observer.
      reply.writableFinished = true;
      reply.emit("finish");
      reply.emit("close");
    };

    simulate("/v1/guest/test?guestToken=very-secret", "GET", 200);
    simulate("/v1/guest/request?bearer=very-secret", "POST", 503);
    simulate("/v1/guest/session?secret=very-secret", "GET", 401);
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatch(
      /^HTTP_METRIC operation=GUEST_READ outcome=SUCCESS status=200 durationMs=\d+$/,
    );
    expect(logs[1]).toMatch(
      /^HTTP_METRIC operation=GUEST_MUTATION outcome=SERVER_FAILURE status=503 durationMs=\d+$/,
    );
    expect(logs[2]).toMatch(
      /^HTTP_METRIC operation=GUEST_READ outcome=AUTH_FAILURE status=401 durationMs=\d+$/,
    );
    expect(logs.join(" ")).not.toContain("very-secret");
  });

  it("records disconnected responses once with bounded non-success outcome", () => {
    const logs: string[] = [];
    const middleware = createHttpMetricsMiddleware((line) => logs.push(line));
    const reply = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: false,
    });
    middleware(
      {
        method: "GET",
        url: "/v1/guest/session?token=secret",
      } as IncomingMessage,
      reply as unknown as ServerResponse,
      vi.fn(),
    );
    reply.emit("close");
    reply.emit("finish");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(
      /^HTTP_METRIC operation=GUEST_READ outcome=CLIENT_FAILURE status=499 durationMs=\d+$/,
    );
  });

  it("uses fixed Guest operation names and safe error categories", () => {
    const secret = "server-session-token-sensitive";
    const metric = formatGuestOperationMetric({
      operation: "GUEST_SESSION_READ",
      outcome: "ERROR",
      errorCode: `DEADLINE_${secret}`,
      durationMs: 4.8,
      requestId: secret,
    });
    expect(metric).toBe(
      "GUEST_OPERATION_METRIC operation=GUEST_SESSION_READ outcome=ERROR errorCategory=TIMEOUT durationMs=5",
    );
    expect(metric).not.toContain(secret);
    expect(
      formatGuestOperationMetric({
        operation: secret,
        outcome: "SUCCESS",
        durationMs: 3,
        requestId: secret,
      }),
    ).toBeUndefined();
    expect(guestErrorClass("DATABASE_UNAVAILABLE")).toBe("DEPENDENCY");
    expect(guestErrorClass("ANTI_ABUSE_EXCEEDED")).toBe("LIMIT");
    expect(guestErrorClass("GUEST_BROWSER_SESSION_CONTEXT_CONFLICT")).toBe(
      "CONFLICT",
    );
  });

  it("has the approved bounded alert thresholds without configured imaginary destinations", () => {
    const policy = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "../../infra/monitoring/guest-t4-alert-policy.json",
        ),
        "utf8",
      ),
    ) as {
      status: string;
      rules: Array<{
        id: string;
        threshold?: number;
        windowSeconds?: number;
        destination: string;
      }>;
    };
    expect(policy.status).toContain("PENDING");
    const rules = new Map(policy.rules.map((rule) => [rule.id, rule]));
    expect(rules.get("http_5xx_ratio")).toMatchObject({
      threshold: 0.01,
      windowSeconds: 300,
    });
    expect(rules.get("guest_read_p95_latency")).toMatchObject({
      threshold: 1,
      windowSeconds: 300,
    });
    expect(rules.get("pool_wait_p95_latency")).toMatchObject({
      threshold: 0.2,
      windowSeconds: 300,
    });
    expect(rules.get("cleanup_backlog_age")).toMatchObject({ threshold: 7200 });
    expect(
      [...rules.values()].every(
        (rule) => rule.destination === "OPERATOR_TO_ASSIGN",
      ),
    ).toBe(true);
  });

  it("publishes limiter cleanup and runtime counters without SQL or credentials", () => {
    const previousRelease = process.env.VAYLET_RELEASE_GIT_SHA;
    process.env.VAYLET_RELEASE_GIT_SHA = "not-a-verified-sha-secret";
    recordLimiterMaintenanceSnapshot({
      runs: 3,
      deleted: 21,
      failures: 1,
      durationMs: 42,
      expiredSample: 8,
      oldestExpiredAgeSeconds: 7300,
    });
    expect(readLimiterMaintenanceSnapshot().oldestExpiredAgeSeconds).toBe(7300);
    const pool = {
      totalCount: 2,
      idleCount: 1,
      waitingCount: 0,
    } as unknown as PostgresPool;
    const formatted = formatRuntimeMetrics(readRuntimeMetrics(pool));
    expect(formatted).toContain("limiterCleanupRuns=3");
    expect(formatted).toContain("limiterOldestExpiredAgeSeconds=7300");
    expect(formatted).toContain("releaseSha=UNVERIFIED");
    expect(formatted).toContain("total=2 idle=1 waiting=0");
    expect(formatted).not.toContain("postgres://");
    expect(formatted).not.toContain("token=");
    expect(formatted).not.toContain("not-a-verified-sha-secret");
    if (previousRelease === undefined)
      delete process.env.VAYLET_RELEASE_GIT_SHA;
    else process.env.VAYLET_RELEASE_GIT_SHA = previousRelease;
    recordLimiterMaintenanceSnapshot({
      runs: 0,
      deleted: 0,
      failures: 0,
      durationMs: 0,
      expiredSample: 0,
      oldestExpiredAgeSeconds: 0,
    });
  });
});
