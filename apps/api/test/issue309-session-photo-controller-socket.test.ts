import { get, createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import type { OperationMeasurement } from "../src/common/observability/operation-observability";
import type { StaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { DashboardSessionPhotoController } from "../src/modules/dashboard/session-photo-controller";
import type { DashboardSessionPhotoService } from "../src/modules/dashboard/session-photo-service";

const uuid = "00000000-0000-4000-8000-000000000001";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
type Response = Parameters<DashboardSessionPhotoController["bytes"]>[6];
type Deliver = (
  res: ServerResponse,
  callback: (bytes: Buffer, release: () => void) => void,
) => Promise<void>;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function fixture(deliver: Deliver) {
  const measurements: OperationMeasurement[] = [];
  const done = deferred<void>();
  const entered = deferred<ServerResponse>();
  const release = vi.fn();
  const send = vi.fn();
  const request: ApiRequest = {
    headers: { authorization: "Bearer test-token" },
    rawHeaders: ["authorization", "Bearer test-token"],
    requestId: "socket-lifecycle-test",
  };
  const controller = new DashboardSessionPhotoController(
    { deliver: async (_request: unknown, _id: string,
      callback: (bytes: Buffer, release: () => void) => void) => {
      await deliver(await entered.promise, callback);
    } } as unknown as DashboardSessionPhotoService,
    new ApiOperationRunner(
      { now: () => 10 },
      { observe: async (measurement) => { measurements.push(measurement); } },
    ),
    { resolve: async () => ({
      userId: uuid,
      staffAuthSessionId: uuid,
      accessTokenHash: "synthetic",
      createdAt: new Date(0),
    }) } as StaffSessionContextResolver,
  );
  const server = createServer((_incoming, response) => {
    const express = Object.assign(response, {
      status(code: number) {
        response.statusCode = code;
        return express;
      },
    });
    const originalEnd = response.end.bind(response);
    response.end = ((...args: Parameters<ServerResponse["end"]>) => {
      send();
      return originalEnd(...args);
    }) as ServerResponse["end"];
    entered.resolve(response);
    void controller.bytes(
      request, "Bearer test-token", uuid, uuid, uuid, {}, express as Response,
    ).then(done.resolve, done.reject);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  function connect() {
    const finished = deferred<{ status: number; body: Buffer }>();
    const http = get(`http://127.0.0.1:${port}/`, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", finished.reject);
      response.on("end", () => finished.resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks),
      }));
    });
    http.on("error", finished.reject);
    // Early client close is deliberately expected in some tests.
    void finished.promise.catch(() => {});
    return { http, finished: finished.promise };
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return { connect, done: done.promise, entered: entered.promise,
    measurements, release, send, stop };
}

afterEach(() => vi.restoreAllMocks());

describe("Issue309 real Node ServerResponse lifecycle", () => {
  it("closes before delayed S3 callback: no end, and admission releases once", async () => {
    const started = deferred();
    const continueStorage = deferred();
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const app = await fixture(async (_res, callback) => {
      started.resolve();
      await continueStorage.promise;
      try {
        callback(jpeg, app.release);
      } catch {
        app.release(); // service's !queued finally release
        throw new Error("storage callback rejected after disconnect");
      }
    });
    try {
      const client = app.connect();
      await started.promise;
      const response = await app.entered;
      const closed = new Promise<void>((resolve) => response.once("close", resolve));
      client.http.destroy();
      await closed;
      expect(response.destroyed).toBe(true);
      continueStorage.resolve();
      await expect(app.done).resolves.toBeUndefined();
      expect(app.send).not.toHaveBeenCalled();
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
      expect(log).toHaveBeenCalledWith(
        "PHOTO_BYTES_ERROR_AFTER_CLOSE requestId=socket-lifecycle-test",
      );
    } finally {
      continueStorage.resolve();
      await app.stop();
    }
  });

  it("connection destroys after early listeners attach, before end: no write/leak", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const app = await fixture(async (response, callback) => {
      response.destroy();
      try {
        callback(jpeg, app.release);
      } catch {
        app.release();
        throw new Error("closed before enqueue");
      }
    });
    try {
      app.connect();
      await expect(app.done).resolves.toBeUndefined();
      expect(app.send).not.toHaveBeenCalled();
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
    } finally {
      await app.stop();
    }
  });

  it("end throws after flushing headers: aborts socket, no second JSON", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const app = await fixture(async (response, callback) => {
      response.end = (() => {
        response.flushHeaders();
        throw new Error("simulated response write failure");
      }) as ServerResponse["end"];
      try {
        callback(jpeg, app.release);
      } catch {
        app.release();
        throw new Error("storage enqueue failure");
      }
    });
    try {
      app.connect();
      await expect(app.done).resolves.toBeUndefined();
      const response = await app.entered;
      expect(response.headersSent).toBe(true);
      expect(response.destroyed).toBe(true);
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
    } finally {
      await app.stop();
    }
  });

  it("close during setHeader before end cannot silently succeed or leak quota", async () => {
    const app = await fixture(async (response, callback) => {
      const original = response.setHeader.bind(response);
      response.setHeader = ((name: string, value: number | string | readonly string[]) => {
        const result = original(name, value);
        if (name === "Content-Type") response.destroy();
        return result;
      }) as ServerResponse["setHeader"];
      try {
        callback(jpeg, app.release);
      } catch {
        app.release();
        throw new Error("delivery to closed response");
      }
    });
    try {
      app.connect();
      await expect(app.done).resolves.toBeUndefined();
      const response = await app.entered;
      expect(response.destroyed).toBe(true);
      expect(app.send).not.toHaveBeenCalled();
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
    } finally {
      await app.stop();
    }
  });

  it("silent end() on a socket destroyed synchronously during end is an ERROR", async () => {
    const app = await fixture(async (response, callback) => {
      const original = response.end.bind(response);
      response.end = ((...args: Parameters<ServerResponse["end"]>) => {
        response.destroy();
        return original(...args);
      }) as ServerResponse["end"];
      try {
        callback(jpeg, app.release);
      } catch {
        app.release();
        throw new Error("socket destroyed inside end");
      }
    });
    try {
      app.connect();
      await expect(app.done).resolves.toBeUndefined();
      const response = await app.entered;
      expect(response.destroyed).toBe(true);
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
    } finally {
      await app.stop();
    }
  });

  it("normal finish and close release once even when end emits finish immediately", async () => {
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const app = await fixture(async (_response, callback) => {
      callback(jpeg, app.release);
    });
    try {
      const client = app.connect();
      const [reply] = await Promise.all([client.finished, app.done]);
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual(jpeg);
      const response = await app.entered;
      expect(response.writableEnded).toBe(true);
      expect(app.send).toHaveBeenCalledOnce();
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("SUCCESS");
      expect(log).not.toHaveBeenCalled();
    } finally {
      await app.stop();
    }
  });

  it("post-enqueue COMMIT failure preserves emitted JPEG and records ERROR, no second send", async () => {
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const app = await fixture(async (_response, callback) => {
      callback(jpeg, app.release);
      throw new Error("simulated COMMIT 08006");
    });
    try {
      const client = app.connect();
      const [reply] = await Promise.all([client.finished, app.done]);
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual(jpeg);
      expect(app.send).toHaveBeenCalledOnce();
      expect(app.release).toHaveBeenCalledOnce();
      expect(app.measurements.at(-1)?.outcome).toBe("ERROR");
      expect(log).toHaveBeenCalledWith(
        "PHOTO_BYTES_ERROR_AFTER_RESPONSE requestId=socket-lifecycle-test",
      );
    } finally {
      await app.stop();
    }
  });
});
