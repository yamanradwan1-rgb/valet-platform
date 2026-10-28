import { describe, expect, it } from "vitest";
import {
  databaseOperationIndex,
  databaseOperations,
  withHttpDatabaseOperation,
} from "../src/common/observability/database-operation-context";

describe("bounded database operation context", () => {
  it.each([
    ["POST", "/v1/staff/auth/native/refresh", "AUTH"],
    ["GET", "/v1/staff/operational-context", "CONTEXT"],
    ["GET", "/v1/staff/tasks/queue?locationId=private", "TASK_QUEUE"],
    ["GET", "/v1/staff/valet-sessions/directory", "DIRECTORY"],
    ["POST", "/v1/staff/check-in/intakes", "CHECK_IN"],
    [
      "POST",
      "/v1/staff/check-in/sessions/private/condition-photo-uploads",
      "PHOTO",
    ],
    [
      "GET",
      "/v1/staff/dashboard/locations/private/overview/tasks",
      "DASHBOARD",
    ],
    ["POST", "/v1/guest/session/request-retrieval", "GUEST"],
    ["POST", "/v1/staff/valet-sessions/private/confirm-parked", "STAFF"],
    ["GET", "/health/ready", "HEALTH"],
    ["GET", "/unknown?token=private", "OTHER"],
  ])("maps %s %s to a source-owned category", (method, url, expected) => {
    const observed = withHttpDatabaseOperation(method, url, () =>
      databaseOperationIndex(),
    );
    expect(databaseOperations[observed]).toBe(expected);
    expect(databaseOperationIndex()).toBe(0);
  });

  it("isolates overlapping asynchronous requests and restores the background context", async () => {
    let resume!: () => void;
    const latch = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const first = withHttpDatabaseOperation(
      "GET",
      "/v1/staff/tasks/queue",
      async () => {
        await latch;
        return databaseOperationIndex();
      },
    );
    const second = await withHttpDatabaseOperation(
      "GET",
      "/v1/staff/valet-sessions/directory",
      async () => {
        await Promise.resolve();
        return databaseOperationIndex();
      },
    );
    resume();
    expect(databaseOperations[await first]).toBe("TASK_QUEUE");
    expect(databaseOperations[second]).toBe("DIRECTORY");
    expect(databaseOperationIndex()).toBe(0);
  });

  it("restores context after an error and tolerates malformed request metadata", () => {
    expect(() =>
      withHttpDatabaseOperation("GET", "/health/ready", () => {
        throw new Error("controlled failure");
      }),
    ).toThrow("controlled failure");
    expect(databaseOperationIndex()).toBe(0);
    expect(
      withHttpDatabaseOperation(null, {}, () => databaseOperationIndex()),
    ).toBe(0);
  });
});
