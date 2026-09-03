import { describe, expect, it } from "vitest";

import {
  accessB,
  accessBRestored,
  access1,
  authenticatedStorage,
  createTestSession,
  deferred,
  fixture,
  refreshB,
  refreshBRestored,
  refresh0,
  refresh1,
  response,
  StubNativeAuthTransport,
} from "./native-auth-test-fixture";

describe("native Staff authentication logout and identity isolation", () => {
  it("ignores definitive-loss requests belonging to an older auth generation", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.start();
    const before = test.session.current();

    await test.session.handleDefinitiveAuthorizationLoss(
      before.authGeneration - 1,
    );

    expect(test.session.current()).toEqual(before);
    expect(test.session.getAccessToken()).toBeDefined();
    expect(test.purges).toHaveLength(0);
  });

  it("applies an immediate definitive-loss barrier to protected request rejection", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.start();
    expect(test.session.current().phase).toBe("authenticated");

    const loss = test.session.handleDefinitiveAuthorizationLoss(
      test.session.current().authGeneration,
    );
    expect(test.session.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "definitive-auth-loss",
    });
    expect(test.session.getAccessToken()).toBeUndefined();
    await loss;

    expect(test.purges).toHaveLength(1);
    expect(test.installation.value).toMatchObject({ restoreBlocked: true });
    expect(test.secure.value).toBeNull();
  });

  it("serializes logout behind an in-progress secure refresh replacement", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const writeGate = deferred<void>();
    const writeStarted = deferred<void>();
    test.secure.writeGate = writeGate.promise;
    test.secure.writeStarted = () => writeStarted.resolve();

    const refresh = test.session.refresh();
    await writeStarted.promise;
    const logout = test.session.logout();
    expect(test.session.getAccessToken()).toBeUndefined();

    writeGate.resolve();
    await expect(refresh).resolves.toBe("stale");
    await expect(logout).resolves.toMatchObject({ localLogoutComplete: true });
    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.installation.value).toMatchObject({ restoreBlocked: true });
    expect(test.secure.value).toBeNull();

    const restartTransport = new StubNativeAuthTransport();
    const restarted = createTestSession(
      test.secure,
      test.installation,
      restartTransport,
    );
    await restarted.start();
    expect(restarted.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "logged-out",
    });
    expect(restartTransport.refreshCalls).toHaveLength(0);
  });

  it("keeps User B durable when account switch races User A secure commit", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const writeGate = deferred<void>();
    const writeStarted = deferred<void>();
    test.secure.writeGate = writeGate.promise;
    test.secure.writeStarted = () => writeStarted.resolve();

    const oldRefresh = test.session.refresh();
    await writeStarted.promise;
    test.transport.loginResult = Promise.resolve(response(accessB, refreshB));
    const accountSwitch = test.session.switchAccount({
      email: "user-b@example.com",
      password: "new password",
    });

    writeGate.resolve();
    await expect(oldRefresh).resolves.toBe("stale");
    await expect(accountSwitch).resolves.toBe(true);
    expect(test.session.getAccessToken()).toBe(accessB);
    expect(test.secure.value).toMatchObject({ refreshToken: refreshB });

    const restartTransport = new StubNativeAuthTransport();
    restartTransport.refreshResult = Promise.resolve(
      response(accessBRestored, refreshBRestored),
    );
    const restarted = createTestSession(
      test.secure,
      test.installation,
      restartTransport,
    );
    await restarted.start();
    expect(restartTransport.refreshCalls).toEqual([refreshB]);
    expect(restarted.getAccessToken()).toBe(accessBRestored);
    expect(test.secure.value).toMatchObject({
      refreshToken: refreshBRestored,
    });
  });

  it("blocks a late refresh from restoring the logged-out identity", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const gate = deferred<ReturnType<typeof response>>();
    const started = deferred<void>();
    test.transport.refreshResult = gate.promise;
    test.transport.refreshStarted = () => started.resolve();
    const refresh = test.session.refresh();
    await started.promise;

    const logout = test.session.logout();
    gate.resolve(response());
    await refresh;
    await logout;

    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.session.current().phase).toBe("unauthenticated");
    expect(test.secure.value).toBeNull();
    expect(test.transport.logoutCalls).toContain(refresh0);
    expect(test.transport.logoutCalls).toContain(refresh1);
  });

  it("reports secure purge and server revocation independently", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.secure.deleteFailure = true;
    test.transport.logoutFailure = true;

    await expect(test.session.logout()).resolves.toEqual({
      localLogoutComplete: true,
      securePurgeConfirmed: false,
      serverRevocationConfirmed: false,
    });
    expect(test.session.current().phase).toBe("unauthenticated");
    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.installation.value).toMatchObject({ restoreBlocked: true });
  });

  it("makes repeated logout safe and restart remains logged out", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.logout();
    await expect(test.session.logout()).resolves.toMatchObject({
      localLogoutComplete: true,
    });
    await test.session.start();
    expect(test.session.current()).toMatchObject({
      phase: "unauthenticated",
      reason: "logged-out",
    });
    expect(test.transport.refreshCalls).toHaveLength(0);
  });

  it("enters fatal state only when neither restore block nor deletion succeeds", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.installation.writeFailure = true;
    test.secure.deleteFailure = true;

    await expect(test.session.logout()).resolves.toMatchObject({
      localLogoutComplete: false,
      securePurgeConfirmed: false,
    });
    expect(test.session.current().phase).toBe("fatal");
  });

  it("purges old identity before publishing an account switch", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.transport.loginResult = Promise.resolve(response(access1, refresh1));

    await expect(
      test.session.switchAccount({
        email: "user-b@example.com",
        password: "new password",
      }),
    ).resolves.toBe(true);

    expect(test.purges).toHaveLength(1);
    expect(test.transport.logoutCalls[0]).toBe(refresh0);
    expect(test.session.getAccessToken()).toBe(access1);
  });
});
