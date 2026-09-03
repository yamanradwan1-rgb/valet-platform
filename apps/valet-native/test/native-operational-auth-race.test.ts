import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";

import { createNativeOperationalTransport } from "../src/tasks/native-operational-http";

const reference = "11111111-1111-4111-8111-111111111111";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function authHarness() {
  let generation = 1;
  const refresh = vi.fn(async () => "refreshed" as const);
  const loss = vi
    .fn<(expectedGeneration: number) => Promise<void>>()
    .mockResolvedValue(undefined);
  const session = {
    current: () => ({ authGeneration: generation, phase: "authenticated" }),
    getAccessToken: () => "synthetic-operational-test-token",
    handleDefinitiveAuthorizationLoss: loss,
    refresh,
  } as unknown as NativeAuthSession;
  return {
    session,
    refresh,
    loss,
    replaceIdentity: () => {
      generation += 1;
    },
  };
}

function rejection(status: number, code = "TASK_NOT_FOUND_OR_FORBIDDEN") {
  return Response.json({ code, message: "Denied" }, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native operational request auth generation", () => {
  it("stops after one refresh and one retry when the current GET stays unauthorized", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () =>
      rejection(401, "STAFF_AUTHENTICATION_REQUIRED"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = authHarness();
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth.session,
    );

    await expect(transport.loadTaskQueue(reference)).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.loss).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([
    ["GET", 401],
    ["POST", 401],
    ["GET", 403],
    ["POST", 403],
    ["GET", 404],
    ["POST", 404],
  ] as const)(
    "ignores stale User A %s/%s auth side effects after User B",
    async (method, status) => {
      vi.stubGlobal("__DEV__", false);
      const response = deferred<Response>();
      const fetchMock = vi.fn(() => response.promise);
      vi.stubGlobal("fetch", fetchMock);
      const auth = authHarness();
      const transport = createNativeOperationalTransport(
        "https://api.example.com",
        auth.session,
      );

      const request =
        method === "GET"
          ? transport.loadTaskQueue(reference)
          : transport.acceptTask(reference, 2);
      auth.replaceIdentity();
      response.resolve(rejection(status));
      await expect(request).rejects.toMatchObject({ status });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.loss).not.toHaveBeenCalled();
      expect(auth.session.current().authGeneration).toBe(2);
    },
  );

  it("keeps a current Task 404 resource-scoped without global logout", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () => rejection(404));
    vi.stubGlobal("fetch", fetchMock);
    const auth = authHarness();
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth.session,
    );

    await expect(transport.acceptTask(reference, 2)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
      status: 404,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.loss).not.toHaveBeenCalled();
  });

  it.each([403, 404])(
    "keeps current queue HTTP %s resource-scoped",
    async (status) => {
      vi.stubGlobal("__DEV__", false);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rejection(status)),
      );
      const auth = authHarness();
      const transport = createNativeOperationalTransport(
        "https://api.example.com",
        auth.session,
      );

      await expect(transport.loadTaskQueue(reference)).rejects.toMatchObject({
        status,
      });

      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.loss).not.toHaveBeenCalled();
    },
  );

  it("does not retry or purge the new identity when an old refresh completes", async () => {
    vi.stubGlobal("__DEV__", false);
    const refreshStarted = deferred<void>();
    const refreshResult = deferred<"refreshed">();
    const auth = authHarness();
    auth.refresh.mockImplementation(() => {
      refreshStarted.resolve();
      return refreshResult.promise;
    });
    const fetchMock = vi.fn(async () =>
      rejection(401, "STAFF_AUTHENTICATION_REQUIRED"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth.session,
    );

    const request = transport.loadTaskQueue(reference);
    await refreshStarted.promise;
    auth.replaceIdentity();
    refreshResult.resolve("refreshed");
    await expect(request).rejects.toMatchObject({ status: 401 });

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.loss).not.toHaveBeenCalled();
    expect(auth.session.current().authGeneration).toBe(2);
  });
});
