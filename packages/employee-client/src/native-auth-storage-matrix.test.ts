import { describe, expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  authenticatedStorage,
  accessB,
  createTestSession,
  deferred,
  fixture,
  refresh0,
  refresh1,
  refreshB,
  response,
  StubNativeAuthTransport,
} from "./native-auth-test-fixture";

const credentials = { email: "employee@example.com", password: "password" };

describe("Native auth durable failure and restart matrix", () => {
  it("a new process inherits no access while the old restore is incomplete", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const lost = deferred<ReturnType<typeof response>>();
    test.transport.refreshResult = lost.promise;
    void test.session.start();
    await Promise.resolve();
    expect(test.session.getAccessToken()).toBeUndefined();

    const restartedTransport = new StubNativeAuthTransport();
    const restarted = createTestSession(
      test.secure,
      test.installation,
      restartedTransport,
    );
    expect(restarted.getAccessToken()).toBeUndefined();
    await restarted.start();
    expect(restartedTransport.refreshCalls).toEqual([refresh0]);
  });

  it.each(["secure", "installation"] as const)(
    "fails closed when %s restoration state cannot be read",
    async (kind) => {
      const test = fixture();
      authenticatedStorage(test.secure, test.installation);
      if (kind === "secure") test.secure.readFailure = true;
      else test.installation.readFailure = true;
      await test.session.start();
      expect(test.session.current().phase).toBe("fatal");
      expect(test.session.getAccessToken()).toBeUndefined();
    },
  );

  it("does not publish access when installation activation fails", async () => {
    const test = fixture();
    await test.session.start();
    test.installation.failWriteAt = test.installation.writeCalls + 1;
    await expect(test.session.login(credentials)).resolves.toBe(false);
    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.secure.value).toBeNull();
    expect(test.transport.logoutCalls).toContain(refresh1);
    expect(JSON.stringify(test.session.current())).not.toContain(refresh1);
  });

  it("allows local logout when either durable protection is confirmed", async () => {
    const blocked = fixture();
    authenticatedStorage(blocked.secure, blocked.installation);
    blocked.secure.deleteFailure = true;
    await expect(blocked.session.logout()).resolves.toMatchObject({
      localLogoutComplete: true,
      securePurgeConfirmed: false,
    });
    expect(blocked.installation.value).toMatchObject({ restoreBlocked: true });

    const deleted = fixture();
    authenticatedStorage(deleted.secure, deleted.installation);
    deleted.installation.writeFailure = true;
    await expect(deleted.session.logout()).resolves.toMatchObject({
      localLogoutComplete: true,
      securePurgeConfirmed: true,
    });
    expect(deleted.secure.value).toBeNull();
  });

  it("a restore block prevents restart before secure deletion completes", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    const deletion = deferred<void>();
    const deletionStarted = deferred<void>();
    test.secure.deleteGate = deletion.promise;
    test.secure.deleteStarted = () => deletionStarted.resolve();
    const logout = test.session.logout();
    await deletionStarted.promise;
    expect(test.installation.value).toMatchObject({ restoreBlocked: true });
    const restartedTransport = new StubNativeAuthTransport();
    const restarted = createTestSession(
      test.secure,
      test.installation,
      restartedTransport,
    );
    const restore = restarted.start();
    await Promise.resolve();
    deletion.resolve();
    await Promise.all([logout, restore]);
    expect(restarted.current().phase).toBe("unauthenticated");
    expect(restarted.getAccessToken()).toBeUndefined();
    expect(restartedTransport.refreshCalls).toHaveLength(0);
  });

  it("restores only with a securely committed current rotated credential", async () => {
    const first = fixture();
    authenticatedStorage(first.secure, first.installation);
    first.transport.refreshResult = Promise.resolve(response());
    await first.session.refresh();
    expect(first.secure.value).toMatchObject({ refreshToken: refresh1 });

    const restartedTransport = new StubNativeAuthTransport();
    restartedTransport.refreshResult = Promise.resolve(response());
    const restarted = createTestSession(
      first.secure,
      first.installation,
      restartedTransport,
    );
    expect(restarted.getAccessToken()).toBeUndefined();
    await restarted.start();
    expect(restartedTransport.refreshCalls).toEqual([refresh1]);
    expect(restartedTransport.refreshCalls).not.toContain(refresh0);
  });

  it("restart during pre-publication activation uses only the durable new refresh", async () => {
    const first = fixture();
    authenticatedStorage(first.secure, first.installation);
    const activation = deferred<void>();
    const activationStarted = deferred<void>();
    first.installation.writeGate = activation.promise;
    first.installation.writeStarted = () => activationStarted.resolve();
    const oldProcess = first.session.refresh();
    await activationStarted.promise;
    expect(first.session.getAccessToken()).toBeUndefined();
    expect(first.secure.value).toMatchObject({ refreshToken: refresh1 });

    const restartedTransport = new StubNativeAuthTransport();
    const restartedRefresh = deferred<void>();
    restartedTransport.refreshStarted = () => restartedRefresh.resolve();
    restartedTransport.refreshResult = Promise.resolve(
      response(accessB, refreshB),
    );
    const restarted = createTestSession(
      first.secure,
      first.installation,
      restartedTransport,
    );
    const restore = restarted.start();
    await restartedRefresh.promise;
    expect(restartedTransport.refreshCalls).toEqual([refresh1]);
    expect(restartedTransport.refreshCalls).not.toContain(refresh0);
    activation.resolve();
    await Promise.all([oldProcess, restore]);
    expect(restarted.getAccessToken()).toBe(accessB);
  });

  it("server logout outage cannot restore a locally logged-out identity", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    test.transport.logoutFailure = true;
    await expect(test.session.logout()).resolves.toMatchObject({
      localLogoutComplete: true,
      serverRevocationConfirmed: false,
    });
    const restarted = createTestSession(
      test.secure,
      test.installation,
      new StubNativeAuthTransport(),
    );
    await restarted.start();
    expect(restarted.current().phase).toBe("unauthenticated");
    expect(restarted.getAccessToken()).toBeUndefined();
  });

  it.each([408, 500, 503])(
    "keeps durable refresh state after transient HTTP %s refresh failure",
    async (status) => {
      const test = fixture();
      authenticatedStorage(test.secure, test.installation);
      test.transport.refreshResult = Promise.reject(
        new EmployeeApiError({
          code: "STAFF_SESSION_SERVICE_UNAVAILABLE",
          message: "temporarily unavailable",
          status,
        }),
      );
      await expect(test.session.refresh()).resolves.toBe("transient-failure");
      expect(test.secure.value).toMatchObject({ refreshToken: refresh0 });
      expect(test.session.getAccessToken()).toBeUndefined();
      expect(test.purges).toHaveLength(0);
    },
  );
});
