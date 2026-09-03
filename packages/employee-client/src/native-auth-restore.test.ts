import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import {
  access1,
  accessB,
  authFailure,
  authenticatedStorage,
  deferred,
  fixture,
  generation,
  refresh0,
  refresh1,
  refreshB,
  response,
} from "./native-auth-test-fixture";

describe("native Staff authentication restoration and refresh", () => {
  it("shows login without attempting restoration when secure state is missing", async () => {
    const test = fixture();
    test.installation.value = {
      generation,
      restoreBlocked: false,
      version: 1,
    };

    await test.session.start();

    expect(test.session.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "initial",
    });
    expect(test.transport.refreshCalls).toHaveLength(0);
  });

  it("restores only by rotating a valid secure refresh credential", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);

    await test.session.start();

    expect(test.transport.refreshCalls).toEqual([refresh0]);
    expect(test.session.getAccessToken()).toBe(access1);
    expect(test.secure.value).toEqual({
      installationGeneration: generation,
      refreshToken: refresh1,
      version: 1,
    });
  });

  it.each([
    ["corrupt", "corrupt"],
    [
      "unknown version",
      {
        installationGeneration: generation,
        refreshToken: refresh0,
        version: 2,
      },
    ],
    [
      "generation mismatch",
      {
        installationGeneration: "installation-generation-0002",
        refreshToken: refresh0,
        version: 1,
      },
    ],
  ])("rejects %s secure state and purges identity", async (_name, value) => {
    const test = fixture();
    test.installation.value = {
      generation,
      restoreBlocked: false,
      version: 1,
    };
    test.secure.value = value;

    await test.session.start();

    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.session.current().phase).toBe("unauthenticated");
    expect(test.secure.value).toBeNull();
    expect(test.transport.refreshCalls).toHaveLength(0);
    expect(test.purges).toHaveLength(1);
  });

  it("keeps R0 and offers truthful retry after a transient restore failure", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.transport.refreshResult = Promise.reject(employeeNetworkError());

    await test.session.start();

    expect(test.session.current().phase).toBe("restoration-unavailable");
    expect(test.secure.value).toMatchObject({ refreshToken: refresh0 });
    expect(test.session.getAccessToken()).toBeUndefined();

    test.transport.refreshResult = Promise.resolve(response());
    await expect(test.session.refresh()).resolves.toBe("refreshed");
    expect(test.session.getAccessToken()).toBe(access1);
  });

  it("purges on definitive refresh loss", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.transport.refreshResult = Promise.reject(authFailure());

    await test.session.start();

    expect(test.session.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "definitive-auth-loss",
    });
    expect(test.secure.value).toBeNull();
    expect(test.purges).toHaveLength(1);
  });

  it("coalesces concurrent callers into one refresh request", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const gate = deferred<ReturnType<typeof response>>();
    const started = deferred<void>();
    test.transport.refreshResult = gate.promise;
    test.transport.refreshStarted = () => started.resolve();

    const first = test.session.refresh();
    const second = test.session.refresh();
    await started.promise;
    expect(test.transport.refreshCalls).toEqual([refresh0]);

    gate.resolve(response());
    await expect(Promise.all([first, second])).resolves.toEqual([
      "refreshed",
      "refreshed",
    ]);
  });

  it("retains R0 after a lost response, then purges on replay rejection", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.transport.refreshResult = Promise.reject(employeeNetworkError());
    await expect(test.session.refresh()).resolves.toBe("transient-failure");
    expect(test.secure.value).toMatchObject({ refreshToken: refresh0 });

    test.transport.refreshResult = Promise.reject(authFailure());
    await expect(test.session.refresh()).resolves.toBe("definitive-failure");
    expect(test.secure.value).toBeNull();
    expect(test.session.current().phase).toBe("unauthenticated");
  });

  it.each([
    ["definitive", authFailure],
    ["transient", employeeNetworkError],
  ])(
    "ignores an old %s refresh failure after User B is active",
    async (_name, failure) => {
      const test = fixture();
      authenticatedStorage(test.secure, test.installation);
      const gate = deferred<ReturnType<typeof response>>();
      const started = deferred<void>();
      test.transport.refreshResult = gate.promise;
      test.transport.refreshStarted = () => started.resolve();

      const oldRefresh = test.session.refresh();
      await started.promise;
      test.transport.loginResult = Promise.resolve(response(accessB, refreshB));
      await expect(
        test.session.switchAccount({
          email: "user-b@example.com",
          password: "new password",
        }),
      ).resolves.toBe(true);

      gate.reject(failure());
      await expect(oldRefresh).resolves.toBe("stale");
      expect(test.session.getAccessToken()).toBe(accessB);
      expect(test.session.current().phase).toBe("authenticated");
      expect(test.secure.value).toMatchObject({ refreshToken: refreshB });
      expect(test.purges).toHaveLength(1);
    },
  );

  it("does not let a stale secure-read failure purge User B", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const readGate = deferred<void>();
    const readStarted = deferred<void>();
    test.secure.readGate = readGate.promise;
    test.secure.readStarted = () => readStarted.resolve();

    const oldRefresh = test.session.refresh();
    await readStarted.promise;
    test.secure.readFailure = true;
    test.transport.loginResult = Promise.resolve(response(accessB, refreshB));
    const accountSwitch = test.session.switchAccount({
      email: "user-b@example.com",
      password: "new password",
    });

    readGate.resolve();
    await expect(oldRefresh).resolves.toBe("stale");
    test.secure.readFailure = false;
    await expect(accountSwitch).resolves.toBe(true);
    expect(test.session.getAccessToken()).toBe(accessB);
    expect(test.secure.value).toMatchObject({ refreshToken: refreshB });
    expect(test.purges).toHaveLength(1);
  });
});
