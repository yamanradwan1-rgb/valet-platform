import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accessNew,
  authResponse,
  denied,
  deferred,
  drain,
  notificationAuthFixture,
  refreshNew,
} from "./native-notification-auth-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native protected bearer recovery boundaries", () => {
  it("keeps normal success authenticated without refreshing", async () => {
    const test = await notificationAuthFixture();
    test.fetchMock.mockResolvedValueOnce(Response.json({ current: true }));
    await expect(
      test.client().request({ method: "GET", path: "/normal" }),
    ).resolves.toEqual({ current: true });
    expect(test.auth.current().phase).toBe("authenticated");
    expect(test.calls.some((call) => call.path.endsWith("/refresh"))).toBe(
      false,
    );
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "refreshes after %s 401 without replaying the mutation",
    async (method) => {
      const test = await notificationAuthFixture();
      test.fetchMock.mockResolvedValueOnce(denied());
      const result = test
        .client()
        .request({ method, path: "/command" })
        .catch((error: unknown) => error);
      await test.refreshStarted.promise;
      test.refreshResponse.resolve(Response.json(authResponse()));
      expect(await result).toMatchObject({ status: 401 });
      expect(test.auth.getAccessToken()).toBe(accessNew);
      expect(
        test.calls.filter((call) => call.path.endsWith("/refresh")),
      ).toHaveLength(1);
      expect(
        test.fetchMock.mock.calls.filter(([url]) => url.endsWith("/command")),
      ).toHaveLength(1);
      expect(test.purges()).toBe(0);
    },
  );

  it("coalesces multiple GETs and overlapping lifecycle refresh", async () => {
    const test = await notificationAuthFixture();
    const reads = Array.from({ length: 8 }, () =>
      test.client().request({ method: "GET", path: "/context" }),
    );
    await test.refreshStarted.promise;
    const lifecycle = test.auth.refresh();
    await drain();
    test.refreshResponse.resolve(Response.json(authResponse()));
    expect(await Promise.all(reads)).toEqual(
      Array.from({ length: 8 }, () => ({ current: true })),
    );
    expect(await lifecycle).toBe("refreshed");
    expect(
      test.calls.filter((call) => call.path.endsWith("/refresh")),
    ).toHaveLength(1);
    expect(test.auth.current().phase).toBe("authenticated");
  });

  it("keeps response correlation local when one client has concurrent requests", async () => {
    const test = await notificationAuthFixture();
    const client = test.client();
    const read = client.request({ method: "GET", path: "/context" });
    await test.refreshStarted.promise;
    const put = client
      .request({ method: "PUT", path: "/command" })
      .catch((error: unknown) => error);
    await test.putStarted.promise;
    test.refreshResponse.resolve(Response.json(authResponse()));
    await read;
    test.putResponse.resolve(denied());
    expect(await put).toMatchObject({ status: 401 });
    expect(
      test.calls.filter((call) => call.path.endsWith("/refresh")),
    ).toHaveLength(1);
    expect(test.auth.current().phase).toBe("authenticated");
  });

  it("stops after one safe retry even when the fresh access is rejected", async () => {
    const test = await notificationAuthFixture();
    const read = test
      .client()
      .request({ method: "HEAD", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    test.fetchMock.mockResolvedValueOnce(denied());
    test.refreshResponse.resolve(Response.json(authResponse()));
    expect(await read).toMatchObject({ status: 401 });
    expect(test.fetchMock).toHaveBeenCalledTimes(4); // login, HEAD, refresh, HEAD
    expect(test.purges()).toBe(0);
  });

  it("does not invalidate a separate rotation in flight after the safe retry", async () => {
    const test = await notificationAuthFixture();
    const retry = deferred<Response>();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    test.fetchMock.mockReturnValueOnce(retry.promise);
    test.refreshResponse.resolve(Response.json(authResponse()));
    await drain();
    const rotation = deferred<Response>();
    test.fetchMock.mockReturnValueOnce(rotation.promise);
    const lifecycle = test.auth.refresh();
    await drain();
    retry.resolve(denied());
    expect(await read).toMatchObject({ status: 401 });
    rotation.resolve(
      Response.json(
        authResponse(`vsa1.${"e".repeat(43)}`, `vsr1.${"f".repeat(43)}`),
      ),
    );
    expect(await lifecycle).toBe("refreshed");
    expect(test.auth.current()).toMatchObject({
      phase: "authenticated",
      authGeneration: 0,
    });
    expect(
      test.calls.filter((call) => call.path.endsWith("/logout")),
    ).toHaveLength(0);
  });

  it("purges on an authoritative refresh 401", async () => {
    const test = await notificationAuthFixture();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    test.refreshResponse.resolve(denied());
    expect(await read).toMatchObject({ status: 401 });
    expect(test.auth.current().phase).toBe("unauthenticated");
    expect(test.auth.getAccessToken()).toBeUndefined();
    expect(test.secure()).toBeNull();
    expect(test.installation()?.restoreBlocked).toBe(true);
    expect(test.purges()).toBe(1);
  });

  it("preserves retryable refresh state on a temporary server failure", async () => {
    const test = await notificationAuthFixture();
    const original = test.secure();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    test.refreshResponse.resolve(Response.json({}, { status: 503 }));
    expect(await read).toMatchObject({ status: 503 });
    expect(test.auth.current().phase).toBe("restoration-unavailable");
    expect(test.secure()).toEqual(original);
    expect(test.purges()).toBe(0);
  });

  it("fails closed and revokes the replacement when secure persistence fails", async () => {
    const test = await notificationAuthFixture();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    test.failSecureWrite();
    test.refreshResponse.resolve(Response.json(authResponse()));
    await read;
    expect(test.auth.current().phase).toBe("unauthenticated");
    expect(test.auth.getAccessToken()).toBeUndefined();
    expect(test.secure()).toBeNull();
    expect(test.installation()?.restoreBlocked).toBe(true);
    expect(
      test.fetchMock.mock.calls.filter(([url]) => url.endsWith("/logout")),
    ).toEqual([
      [
        "https://api.example.com/v1/staff/auth/native/logout",
        expect.objectContaining({
          body: JSON.stringify({ refreshToken: refreshNew }),
        }),
      ],
    ]);
  });

  it("does not automatically retry uncertain refresh after a delayed PUT 401", async () => {
    const test = await notificationAuthFixture();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    const put = test
      .client()
      .request({ method: "PUT", path: "/command" })
      .catch((error: unknown) => error);
    await test.putStarted.promise;
    test.refreshResponse.resolve(Response.json({}, { status: 503 }));
    expect(await read).toMatchObject({ status: 503 });
    test.putResponse.resolve(denied());
    expect(await put).toMatchObject({ status: 401 });
    expect(
      test.calls.filter((call) => call.path.endsWith("/refresh")),
    ).toHaveLength(1);
    expect(test.auth.current().phase).toBe("restoration-unavailable");
    expect(test.purges()).toBe(0);
  });

  it.each([200, 401, 403])(
    "keeps User B isolated from late User A HTTP %s",
    async (status) => {
      const test = await notificationAuthFixture();
      const old = deferred<Response>();
      test.fetchMock.mockReturnValueOnce(old.promise);
      const read = test
        .client()
        .request({ method: "GET", path: "/context" })
        .catch((error: unknown) => error);
      await test.auth.logout();
      const accessB = `vsa1.${"e".repeat(43)}`;
      const refreshB = `vsr1.${"f".repeat(43)}`;
      test.fetchMock.mockResolvedValueOnce(
        Response.json(authResponse(accessB, refreshB)),
      );
      expect(
        await test.auth.login({
          email: "user-b@example.com",
          password: "synthetic-password-b",
        }),
      ).toBe(true);
      old.resolve(status === 401 ? denied() : Response.json({}, { status }));
      await read;
      expect(test.auth.current()).toMatchObject({
        phase: "authenticated",
        authGeneration: 1,
      });
      expect(test.auth.getAccessToken()).toBe(accessB);
      expect(test.secure()?.refreshToken).toBe(refreshB);
      expect(
        test.calls.filter((call) => call.path.endsWith("/refresh")),
      ).toHaveLength(0);
      expect(
        test.calls.filter((call) => call.path.endsWith("/logout")),
      ).toHaveLength(1);
    },
  );

  it("honors explicit logout while refresh is pending", async () => {
    const test = await notificationAuthFixture();
    const read = test
      .client()
      .request({ method: "GET", path: "/context" })
      .catch((error: unknown) => error);
    await test.refreshStarted.promise;
    expect(await test.auth.logout()).toMatchObject({
      localLogoutComplete: true,
      serverRevocationConfirmed: true,
    });
    test.refreshResponse.resolve(Response.json(authResponse()));
    expect(await read).toMatchObject({ status: 401 });
    expect(test.auth.current()).toMatchObject({
      phase: "unauthenticated",
      authGeneration: 1,
    });
    expect(test.auth.getAccessToken()).toBeUndefined();
    expect(test.secure()).toBeNull();
    expect(
      test.calls.filter((call) => call.path.endsWith("/logout")),
    ).toHaveLength(2);
  });
});
