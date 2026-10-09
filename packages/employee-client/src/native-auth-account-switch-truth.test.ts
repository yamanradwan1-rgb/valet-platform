import { describe, expect, it } from "vitest";
import {
  accessB,
  authenticatedStorage,
  createTestSession,
  fixture,
  refresh1,
  refreshB,
  response,
  StubNativeAuthTransport,
} from "./native-auth-test-fixture";

const b = { email: "qa-b@example.invalid", password: "qa-b-pass" };

describe("Issue 273 logout truth before different-User re-enrollment", () => {
  it("preserves a confirmed server logout separately from local purge and B login", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.start();
    test.transport.loginResult = Promise.resolve(response(accessB, refreshB));

    const logout = await test.session.logout();
    expect(logout).toEqual({
      localLogoutComplete: true,
      securePurgeConfirmed: true,
      serverRevocationConfirmed: true,
    });
    expect(test.transport.logoutCalls).toEqual([refresh1]);
    expect(test.secure.value).toBeNull();
    expect(test.session.getAccessToken()).toBeUndefined();
    expect(test.purges).toHaveLength(1);

    expect(await test.session.login(b)).toBe(true);
    expect(test.session.getAccessToken()).toBe(accessB);
    expect(test.secure.value).toMatchObject({ refreshToken: refreshB });
    expect(test.secure.value).not.toMatchObject({ refreshToken: refresh1 });
  });

  it("permits B local login when A remote logout is unconfirmed but never persists A", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.start();
    test.transport.logoutFailure = true;
    test.transport.loginResult = Promise.resolve(response(accessB, refreshB));

    const logout = await test.session.logout();
    expect(logout).toEqual({
      localLogoutComplete: true,
      securePurgeConfirmed: true,
      serverRevocationConfirmed: false,
    });
    expect(test.transport.logoutCalls).toEqual([refresh1]);
    expect(test.secure.value).toBeNull();
    expect(test.session.current().phase).toBe("unauthenticated");
    expect(await test.session.login(b)).toBe(true);
    expect(test.session.getAccessToken()).toBe(accessB);
    expect(test.secure.value).toMatchObject({ refreshToken: refreshB });

    const restartedTransport = new StubNativeAuthTransport();
    restartedTransport.refreshResult = Promise.resolve(
      response(accessB, refreshB),
    );
    const restarted = createTestSession(
      test.secure,
      test.installation,
      restartedTransport,
    );
    await restarted.start();
    expect(restartedTransport.refreshCalls).toEqual([refreshB]);
    expect(restartedTransport.refreshCalls).not.toContain(refresh1);
  });

  it.each([true, false])(
    "does not confuse lost logout response with confirmed server commit (%s)",
    async (commitBeforeLoss) => {
      const test = fixture();
      authenticatedStorage(test.secure, test.installation);
      await test.session.start();
      let serverRevoked = false;
      test.transport.logout = async () => {
        if (commitBeforeLoss) serverRevoked = true;
        throw new Error("synthetic connection lost");
      };
      const result = await test.session.logout();
      expect(result.localLogoutComplete).toBe(true);
      expect(result.securePurgeConfirmed).toBe(true);
      expect(result.serverRevocationConfirmed).toBe(false);
      expect(serverRevoked).toBe(commitBeforeLoss);
      expect(test.secure.value).toBeNull();
      expect(test.session.current().phase).toBe("unauthenticated");
    },
  );

  it("never treats a failed old refresh-token purge as B's authentication authority", async () => {
    const test = fixture();
    authenticatedStorage(test.secure, test.installation);
    await test.session.start();
    test.transport.logoutFailure = true;
    test.secure.deleteFailure = true;
    test.transport.loginResult = Promise.resolve(response(accessB, refreshB));

    const result = await test.session.logout();
    expect(result).toMatchObject({
      localLogoutComplete: true,
      securePurgeConfirmed: false,
      serverRevocationConfirmed: false,
    });
    expect(test.installation.value).toMatchObject({ restoreBlocked: true });
    expect(test.session.getAccessToken()).toBeUndefined();
    // The old raw envelope can physically remain after SecureStore failure,
    // but cannot restore authenticated authority while the block survives.
    const restarted = createTestSession(
      test.secure,
      test.installation,
      new StubNativeAuthTransport(),
    );
    await restarted.start();
    expect(restarted.getAccessToken()).toBeUndefined();
    expect(restarted.current().phase).toBe("unauthenticated");
  });
});
