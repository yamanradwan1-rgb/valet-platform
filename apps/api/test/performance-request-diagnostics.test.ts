import { HttpException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { RuntimeDatabaseUnavailableError } from "../src/common/database/runtime-database-deadline";
import { createHttpMetricsMiddleware } from "../src/common/observability/http-metrics.middleware";
import {
  buildHttpMetric,
  formatHttpMetric,
} from "../src/common/observability/http-operation-metrics";
import { performanceRoute } from "../src/common/observability/performance-request-diagnostics";
import { databaseFailureReason } from "../src/common/database/database-failure-reason";

const runner = new ApiOperationRunner({ now: () => 1 }, { observe: () => {} });

describe("performance request diagnostics", () => {
  it("uses only fixed templates for benchmark routes", () => {
    expect(
      performanceRoute(
        "GET",
        "/v1/staff/dashboard/locations/secret/overview/tasks?phone=secret",
      ),
    ).toBe("/v1/staff/dashboard/locations/:locationId/overview/tasks");
    expect(performanceRoute("GET", "/v1/guest/secret")).toBeUndefined();
    expect(
      performanceRoute("POST", "/v1/staff/operational-context"),
    ).toBeUndefined();
    expect(
      performanceRoute(
        "GET",
        "/v1/staff/dashboard/locations/secret/overview/secret",
      ),
    ).toBeUndefined();
  });

  it("preserves the four-field metric prefix and separates correlation diagnostics", () => {
    const base = formatHttpMetric(
      buildHttpMetric("STAFF_OPERATION", 200, 12.1),
    );
    expect(base).toBe(
      "HTTP_METRIC operation=STAFF_OPERATION outcome=SUCCESS status=200 durationMs=12",
    );
    expect(base).not.toContain("requestId=");

    const lines: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: true,
    });
    createHttpMetricsMiddleware((line) => lines.push(line))(
      {
        method: "GET",
        url: "/v1/staff/dashboard/locations/secret-location/overview/tasks?token=secret-token",
        headers: {
          authorization: "Bearer secret-token",
          cookie: "session=secret-token",
          "x-request-id": "trace-372",
        },
      } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      () => {},
    );
    response.emit("finish");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^HTTP_METRIC operation=STAFF_OPERATION outcome=SUCCESS status=200 durationMs=\d+ route=\/v1\/staff\/dashboard\/locations\/:locationId\/overview\/tasks requestId=trace-372 errorCode=NONE reason=NONE$/,
    );
    expect(lines[0]).not.toContain("secret-location");
    expect(lines[0]).not.toContain("secret-token");
    expect(lines[0]).not.toContain("authorization");
    expect(lines[0]).not.toContain("cookie");
  });

  it("keeps unrelated Guest HTTP records in the original four-field form", () => {
    const lines: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 429,
      writableFinished: true,
    });
    createHttpMetricsMiddleware((line) => lines.push(line))(
      {
        method: "GET",
        url: "/v1/guest/sessions/secret-id?token=secret-token",
        headers: { "x-request-id": "trace-guest-372" },
      } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      () => {},
    );
    response.emit("finish");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^HTTP_METRIC operation=GUEST_READ outcome=RATE_LIMITED status=429 durationMs=\d+$/,
    );
    expect(lines[0]).not.toContain("trace-guest-372");
    expect(lines[0]).not.toContain("secret-token");
  });

  it("keeps authentication credentials out of an extended failure log", () => {
    const lines: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 401,
      writableFinished: true,
    });
    createHttpMetricsMiddleware((line) => lines.push(line))(
      {
        method: "POST",
        url: "/v1/staff/auth/login?refresh=credential-canary",
        headers: {
          authorization: "Bearer credential-canary",
          cookie: "refresh=credential-canary",
          "x-request-id": "safe-auth-372",
        },
      } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      () => {},
    );
    response.emit("finish");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^HTTP_METRIC operation=STAFF_AUTH outcome=AUTH_FAILURE status=401 durationMs=\d+ route=\/v1\/staff\/auth\/login requestId=safe-auth-372 errorCode=NONE reason=AUTHENTICATION$/,
    );
    expect(lines[0]).not.toContain("credential-canary");
    expect(lines[0]).not.toContain("authorization");
    expect(lines[0]).not.toContain("cookie");
  });

  it("correlates the actual 503 and bounded database reason without secrets", async () => {
    const logs: string[] = [];
    const request = {
      method: "GET",
      url: "/v1/staff/tasks/queue?token=secret",
      headers: { authorization: "Bearer secret", "x-request-id": "perf-1" },
    };
    const response = Object.assign(new EventEmitter(), {
      statusCode: 503,
      writableFinished: true,
    });
    createHttpMetricsMiddleware((line) => logs.push(line))(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      () => {},
    );
    const failure = await runner
      .run("TASK_QUEUE_READ", request, async () => {
        throw new RuntimeDatabaseUnavailableError("QUEUE_FULL");
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(503);
    expect((failure as HttpException).getResponse()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Service temporarily unavailable.",
      requestId: "perf-1",
    });
    response.emit("finish");
    response.emit("close");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("status=503");
    expect(logs[0]).toContain(
      "route=/v1/staff/tasks/queue requestId=perf-1 errorCode=INTERNAL_ERROR reason=QUEUE_FULL",
    );
    expect(logs[0]).not.toContain("secret");
  });

  it("records disconnected requests once and tolerates a broken emitter", () => {
    const lines: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: false,
    });
    createHttpMetricsMiddleware((line) => lines.push(line))(
      {
        method: "POST",
        url: "/v1/staff/check-in/intakes",
        headers: {},
      } as IncomingMessage,
      response as unknown as ServerResponse,
      () => {},
    );
    response.emit("close");
    response.emit("finish");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^HTTP_METRIC operation=STAFF_OPERATION outcome=CLIENT_FAILURE status=499 durationMs=\d+ route=\/v1\/staff\/check-in\/intakes requestId=[0-9a-f-]{36} errorCode=NONE reason=CLIENT_DISCONNECT$/,
    );
    const bad = Object.assign(new EventEmitter(), {
      statusCode: 503,
      writableFinished: true,
    });
    let continued = false;
    createHttpMetricsMiddleware(() => {
      throw new Error("logger down");
    })(
      {
        method: "GET",
        url: "/v1/staff/tasks/queue",
        headers: {},
      } as IncomingMessage,
      bad as ServerResponse,
      () => {
        continued = true;
      },
    );
    expect(continued).toBe(true);
    expect(() => bad.emit("finish")).not.toThrow();
    expect(() => bad.emit("close")).not.toThrow();
    expect(bad.statusCode).toBe(503);
  });

  it("classifies only recognized database facts, never raw messages", () => {
    for (const [code, reason] of [
      ["55P03", "LOCK_TIMEOUT"],
      ["57014", "QUERY_CANCELED"],
      ["25P04", "TRANSACTION_TIMEOUT"],
      ["53300", "SERVER_CONNECTION_LIMIT"],
      ["40P01", "DEADLOCK"],
    ])
      expect(databaseFailureReason({ code, message: "secret SQL" })).toBe(
        reason,
      );
    expect(
      databaseFailureReason({
        code: "57014",
        message: "canceling statement due to statement timeout",
      }),
    ).toBe("STATEMENT_TIMEOUT");
    expect(databaseFailureReason(new Error("secret SQL"))).toBeUndefined();
  });
});
