import { HttpException, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import type { OperationMeasurement } from "../src/common/observability/operation-observability";
import type { StaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import {
  DashboardSessionPhotoController,
} from "../src/modules/dashboard/session-photo-controller";
import type { DashboardSessionPhotoService } from "../src/modules/dashboard/session-photo-service";

const uuid = "00000000-0000-4000-8000-000000000001";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

type BinaryResponse = Parameters<DashboardSessionPhotoController["bytes"]>[6];

function createResponse() {
  const headers: Record<string, string> = {};
  const statuses: number[] = [];
  const bodies: Buffer[] = [];
  const callbacks: Record<string, Array<() => void>> = {};
  const response = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string) {
      if (this.headersSent) throw new Error("headers already sent");
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      if (this.headersSent) throw new Error("status after response committed");
      statuses.push(code);
      return this;
    },
    end(body: Buffer) {
      if (this.headersSent || this.writableEnded) throw new Error("double send");
      bodies.push(Buffer.from(body));
      this.headersSent = true;
      this.writableEnded = true;
    },
    once(event: "finish" | "close", listener: () => void) {
      (callbacks[event] ??= []).push(listener);
    },
    destroy() {
      this.destroyed = true;
      this.emit("close");
    },
    emit(event: "finish" | "close") {
      callbacks[event]?.forEach((listener) => listener());
    },
  };
  return { response, headers, statuses, bodies };
}

function setup(
  deliver: (
    _request: unknown,
    _photoId: string,
    callback: (bytes: Buffer, release: () => void) => void,
  ) => Promise<void>,
) {
  const observations: OperationMeasurement[] = [];
  const runner = new ApiOperationRunner(
    { now: () => 1 },
    { observe: async (measurement) => { observations.push(measurement); } },
  );
  const service = {
    deliver: vi.fn(deliver),
  } as unknown as DashboardSessionPhotoService;
  const sessions = {
    resolve: vi.fn(async () => ({
      userId: uuid,
      staffAuthSessionId: uuid,
      accessTokenHash: "not-a-secret",
      createdAt: new Date(0),
    })),
  } as unknown as StaffSessionContextResolver;
  const controller = new DashboardSessionPhotoController(service, runner, sessions);
  const request: ApiRequest = {
    headers: { authorization: "Bearer test-token" },
    rawHeaders: ["authorization", "Bearer test-token"],
    requestId: "photo-response-commit-test",
  };
  const fake = createResponse();
  const call = () => controller.bytes(
    request, "Bearer test-token", uuid, uuid, uuid, {},
    fake.response as BinaryResponse,
  );
  return { call, fake, request, observations, service };
}

afterEach(() => vi.restoreAllMocks());

describe("Issue309 binary controller response after final transaction", () => {
  it("does not trigger a second response when COMMIT rejects after synchronous end", async () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const commitError = Object.assign(new Error("database final COMMIT rejected"), {
      code: "08006",
    });
    const fixture = setup(async (_input, _id, deliver) => {
      deliver(jpeg, () => {});
      throw commitError;
    });

    await expect(fixture.call()).resolves.toBeUndefined();
    expect(fixture.fake.bodies).toEqual([jpeg]);
    expect(fixture.fake.statuses).toEqual([200]);
    expect(fixture.fake.response.headersSent).toBe(true);
    expect(fixture.fake.response.writableEnded).toBe(true);
    expect(fixture.fake.response.destroyed).toBe(false);
    expect(fixture.observations).toEqual([expect.objectContaining({
      operation: "DASHBOARD_SESSION_PHOTO_BYTES",
      outcome: "ERROR",
      requestId: "photo-response-commit-test",
    })]);
    expect(fixture.request.operationMeasured).toBe(true);
    expect(logger).toHaveBeenCalledWith(
      "PHOTO_BYTES_ERROR_AFTER_RESPONSE requestId=photo-response-commit-test",
    );
    // The error is audited by the existing runner even though the already
    // ended HTTP response cannot safely carry a second JSON 500/503.
  });

  it("propagates all pre-send failures for the normal mapped error response", async () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const fixture = setup(async () => {
      throw new Error("photo or SQL failure before the response begins");
    });

    await expect(fixture.call()).rejects.toBeInstanceOf(HttpException);
    expect(fixture.fake.bodies).toHaveLength(0);
    expect(fixture.fake.statuses).toHaveLength(0);
    expect(fixture.fake.response.headersSent).toBe(false);
    expect(fixture.observations).toEqual([expect.objectContaining({
      operation: "DASHBOARD_SESSION_PHOTO_BYTES",
      outcome: "ERROR",
    })]);
    expect(logger).not.toHaveBeenCalled();
  });

  it("aborts an incomplete response after headers flush so the socket cannot hang", async () => {
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const release = vi.fn();
    const fixture = setup(async (_input, _id, deliver) => {
      try {
        deliver(jpeg, release);
      } catch {
        // The production service invokes release in its !queued finally path
        // if synchronous response.end() throws before successful enqueue.
        release();
        throw new Error("photo enqueue failed");
      }
    });
    // Simulate Node streaming headers, then a write failure before end()
    // completes. The controller must destroy the partial HTTP response.
    fixture.fake.response.end = () => {
      fixture.fake.response.headersSent = true;
      throw new Error("socket failed after flushing headers");
    };

    await expect(fixture.call()).resolves.toBeUndefined();
    expect(fixture.fake.bodies).toHaveLength(0);
    expect(fixture.fake.statuses).toEqual([200]);
    expect(fixture.fake.response.writableEnded).toBe(false);
    expect(fixture.fake.response.destroyed).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(fixture.observations[0]?.outcome).toBe("ERROR");
    expect(logger).toHaveBeenCalledWith(
      "PHOTO_BYTES_ERROR_AFTER_HEADERS requestId=photo-response-commit-test",
    );
  });

  it("preserves the normal successful JPEG path and finish/close release", async () => {
    const release = vi.fn();
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const fixture = setup(async (_input, _id, deliver) => {
      deliver(jpeg, release);
    });

    await expect(fixture.call()).resolves.toBeUndefined();
    fixture.fake.response.emit("finish");
    fixture.fake.response.emit("close");
    expect(fixture.fake.bodies).toEqual([jpeg]);
    expect(fixture.fake.statuses).toEqual([200]);
    expect(fixture.fake.headers["cache-control"]).toBe("private, no-store");
    expect(fixture.fake.headers["content-type"]).toBe("image/jpeg");
    expect(fixture.fake.headers["content-length"]).toBe(String(jpeg.length));
    expect(fixture.observations[0]?.outcome).toBe("SUCCESS");
    expect(logger).not.toHaveBeenCalled();
    // Early registered finish/close handlers are idempotent themselves,
    // independent of the admission layer's own idempotent release function.
    expect(release).toHaveBeenCalledOnce();
  });

  it("accepts synchronous finish then close within end() without false ERROR", async () => {
    const release = vi.fn();
    const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const fixture = setup(async (_input, _id, deliver) => {
      deliver(jpeg, release);
    });
    fixture.fake.response.end = (body) => {
      fixture.fake.bodies.push(Buffer.from(body));
      fixture.fake.response.headersSent = true;
      fixture.fake.response.writableEnded = true;
      fixture.fake.response.emit("finish");
      fixture.fake.response.emit("close");
    };

    await expect(fixture.call()).resolves.toBeUndefined();
    expect(fixture.fake.bodies).toEqual([jpeg]);
    expect(release).toHaveBeenCalledOnce();
    expect(fixture.observations[0]?.outcome).toBe("SUCCESS");
    expect(logger).not.toHaveBeenCalled();
  });
});
