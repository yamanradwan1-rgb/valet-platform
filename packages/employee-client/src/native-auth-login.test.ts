import { describe, expect, it } from "vitest";

import {
  accessB,
  access1,
  authFailure,
  deferred,
  fixture,
  generation,
  refreshB,
  refresh1,
  response,
} from "./native-auth-test-fixture";

const credentials = { email: "employee@example.com", password: "password" };

describe("native Staff authentication login", () => {
  it("publishes access only after the secure refresh write is confirmed", async () => {
    const test = fixture();
    await test.session.start();
    const gate = deferred<void>();
    test.secure.writeGate = gate.promise;
    const login = test.session.login(credentials);

    await Promise.resolve();
    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.session.current().phase).toBe("unauthenticated");

    gate.resolve();
    await expect(login).resolves.toBe(true);
    expect(test.session.getAccessToken()).toBe(access1);
    expect(test.session.current().phase).toBe("authenticated");
    expect(test.secure.value).toEqual({
      installationGeneration: generation,
      refreshToken: refresh1,
      version: 1,
    });
  });

  it("fails closed and revokes the ephemeral session on secure write failure", async () => {
    const test = fixture();
    await test.session.start();
    test.secure.writeFailure = true;

    await expect(test.session.login(credentials)).resolves.toBe(false);

    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.session.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "secure-storage-failure",
    });
    expect(test.transport.logoutCalls).toEqual([refresh1]);
    expect(test.purges).toHaveLength(1);
  });

  it("never exposes credentials through state or debug serialization", async () => {
    const test = fixture();
    const canaryAccess = `vsa1.${"x".repeat(43)}`;
    const canaryRefresh = `vsr1.${"y".repeat(43)}`;
    test.transport.loginResult = Promise.resolve(
      response(canaryAccess, canaryRefresh),
    );
    await test.session.start();
    await test.session.login(credentials);

    const serialized = JSON.stringify(test.session);
    expect(serialized).not.toContain(canaryAccess);
    expect(serialized).not.toContain(canaryRefresh);
    expect(test.session.current()).not.toHaveProperty("accessToken");
    expect(test.secure.value).not.toHaveProperty("accessToken");
  });

  it.each([
    ["success", undefined],
    ["failure", authFailure()],
  ])(
    "ignores a stale login %s after User B is active",
    async (_name, failure) => {
      const test = fixture();
      await test.session.start();
      const gate = deferred<ReturnType<typeof response>>();
      const started = deferred<void>();
      test.transport.loginResult = gate.promise;
      test.transport.loginStarted = () => started.resolve();

      const oldLogin = test.session.login(credentials);
      await started.promise;
      test.transport.loginResult = Promise.resolve(response(accessB, refreshB));
      await expect(
        test.session.switchAccount({
          email: "user-b@example.com",
          password: "new password",
        }),
      ).resolves.toBe(true);

      if (failure === undefined) gate.resolve(response());
      else gate.reject(failure);
      await expect(oldLogin).resolves.toBe(false);
      expect(test.session.getAccessToken()).toBe(accessB);
      expect(test.session.current().phase).toBe("authenticated");
      expect(test.secure.value).toMatchObject({ refreshToken: refreshB });
      expect(test.purges).toHaveLength(1);
      if (failure === undefined) {
        expect(test.transport.logoutCalls).toContain(refresh1);
      }
    },
  );
});
