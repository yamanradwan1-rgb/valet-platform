import { describe, expect, it } from "vitest";

import {
  authenticated,
  deferred,
  fakeInstallationId,
  fakeIntentId,
  fakeTokenOne,
  fakeTokenTwo,
  loggedOut,
  pushHarness,
  registrationResponse,
  validWirePayload,
} from "./native-push-fixture";

async function authenticatedHarness() {
  const harness = pushHarness();
  await harness.owner.setForeground(true);
  await harness.owner.setAuth(authenticated());
  return harness;
}

async function waitForCallCount(
  calls: readonly unknown[],
  count: number,
): Promise<void> {
  for (let index = 0; index < 20 && calls.length < count; index += 1) {
    await Promise.resolve();
  }
}

describe("Native push permission and desired state", () => {
  it.each(["undetermined", "denied", "blocked"] as const)(
    "represents %s truthfully without acquiring or registering a token",
    async (permission) => {
      const harness = pushHarness();
      harness.platform.permission = permission;
      await harness.owner.setAuth(authenticated());
      expect(harness.owner.current().permission).toBe(permission);
      expect(harness.platform.getTokenCalls).toBe(0);
      expect(harness.registration.calls).toHaveLength(0);
    },
  );

  it("registers after an explicit later grant", async () => {
    const harness = pushHarness();
    harness.platform.permission = "denied";
    await harness.owner.setAuth(authenticated());
    harness.platform.requestedPermission = Promise.resolve("granted");
    await harness.owner.requestPermission();
    expect(harness.registration.calls).toHaveLength(1);
    expect(harness.owner.current().registration).toBe("confirmed");
  });

  it("degrades a failed pre-permission channel setup without token work", async () => {
    const harness = pushHarness();
    harness.platform.permission = "denied";
    await harness.owner.setAuth(authenticated());
    harness.platform.requestedPermission = Promise.reject(
      new Error("synthetic channel setup failure"),
    );
    await harness.owner.requestPermission();
    expect(harness.owner.current().permission).toBe("unavailable");
    expect(harness.platform.getTokenCalls).toBe(0);
    expect(harness.registration.calls).toHaveLength(0);
  });

  it("ignores a stale permission result after logout", async () => {
    const harness = pushHarness();
    harness.platform.permission = "denied";
    const permission = deferred<"granted">();
    harness.platform.requestedPermission = permission.promise;
    await harness.owner.setAuth(authenticated());
    const request = harness.owner.requestPermission();
    await harness.owner.setAuth(loggedOut());
    permission.resolve("granted");
    await request;
    expect(harness.registration.calls).toHaveLength(0);
    expect(harness.owner.current().registration).toBe("idle");
  });

  it("sends the exact accepted request with runtime metadata and no domain IDs", async () => {
    const { registration } = await authenticatedHarness();
    expect(registration.calls).toEqual([
      {
        appBuild: "101",
        appIdentifier: "com.vaylet.employee",
        appVersion: "1.2.3",
        installationId: fakeInstallationId,
        locale: "en",
        platform: "ANDROID",
        provider: "FCM",
        providerToken: fakeTokenOne,
      },
    ]);
    for (const field of [
      "userId",
      "staffAuthSessionId",
      "membershipId",
      "organizationId",
      "locationId",
      "shiftId",
      "taskId",
      "identityGeneration",
    ]) {
      expect(registration.calls[0]).not.toHaveProperty(field);
    }
  });

  it("degrades missing build metadata without blocking app authority", async () => {
    const harness = pushHarness();
    harness.platform.metadata = undefined;
    await harness.owner.setAuth(authenticated());
    expect(harness.owner.current().registration).toBe("unavailable");
    expect(harness.registration.calls).toHaveLength(0);
  });

  it("keeps registration available when channel setup fails", async () => {
    const harness = pushHarness();
    harness.platform.channelFails = true;
    await harness.owner.setAuth(authenticated());
    expect(harness.owner.current().channelAvailable).toBe(false);
    expect(harness.owner.current().registration).toBe("confirmed");
  });

  it("reports a user-disabled channel without treating it as domain failure", async () => {
    const harness = pushHarness();
    harness.platform.channelAvailable = false;
    await harness.owner.setAuth(authenticated());
    expect(harness.owner.current().channelAvailable).toBe(false);
    expect(harness.owner.current().registration).toBe("confirmed");
    expect(harness.registration.calls).toHaveLength(1);
  });
});

describe("Native push bounded lifecycle and auth fences", () => {
  it("coalesces concurrent triggers and converges without a PUT storm", async () => {
    const harness = pushHarness();
    const pending = deferred<ReturnType<typeof registrationResponse>>();
    harness.registration.responsePromise = pending.promise;
    const first = harness.owner.setAuth(authenticated());
    const duplicate = harness.owner.reconcile("network-recovery");
    await waitForCallCount(harness.registration.calls, 1);
    expect(harness.registration.calls).toHaveLength(1);
    pending.resolve(registrationResponse(harness.registration.calls[0]!));
    await Promise.all([first, duplicate]);
    expect(harness.registration.calls.length).toBeLessThanOrEqual(2);
  });

  it("rotates T1 to T2 and ignores an exact duplicate T2 callback", async () => {
    const harness = await authenticatedHarness();
    await harness.owner.receiveToken(fakeTokenTwo, 1);
    await harness.owner.receiveToken(fakeTokenTwo, 1);
    expect(
      harness.registration.calls.map((call) => call.providerToken),
    ).toEqual([fakeTokenOne, fakeTokenTwo]);
  });

  it("does not confirm an older token response after an in-flight rotation", async () => {
    const harness = pushHarness();
    const pending = deferred<ReturnType<typeof registrationResponse>>();
    harness.registration.responsePromise = pending.promise;
    const snapshots: string[] = [];
    harness.owner.subscribe((snapshot) =>
      snapshots.push(snapshot.registration),
    );
    const initial = harness.owner.setAuth(authenticated());
    await waitForCallCount(harness.registration.calls, 1);
    const rotation = harness.owner.receiveToken(fakeTokenTwo, 1);
    pending.resolve(registrationResponse(harness.registration.calls[0]!));
    await Promise.all([initial, rotation]);
    expect(
      harness.registration.calls.map((call) => call.providerToken),
    ).toEqual([fakeTokenOne, fakeTokenTwo]);
    expect(snapshots.filter((state) => state === "confirmed")).toHaveLength(1);
  });

  it("reconciles changed locale and foreground metadata", async () => {
    const harness = await authenticatedHarness();
    await harness.owner.setLocale("ar");
    harness.platform.metadata = { appBuild: "102", appVersion: "1.2.4" };
    await harness.owner.setForeground(false);
    await harness.owner.setForeground(true);
    expect(harness.registration.calls.at(-1)).toMatchObject({
      appBuild: "102",
      appVersion: "1.2.4",
      locale: "ar",
    });
  });

  it("ignores token acquisition completed after logout", async () => {
    const harness = pushHarness();
    const token = deferred<string>();
    harness.platform.getCurrentToken = async () => {
      harness.platform.getTokenCalls += 1;
      return token.promise;
    };
    const reconcile = harness.owner.setAuth(authenticated());
    await harness.owner.setAuth(loggedOut());
    token.resolve(fakeTokenOne);
    await reconcile;
    expect(harness.registration.calls).toHaveLength(0);
  });

  it("fences an in-flight PUT immediately when identity purge begins", async () => {
    const harness = pushHarness();
    const pending = deferred<ReturnType<typeof registrationResponse>>();
    harness.registration.responsePromise = pending.promise;
    const reconcile = harness.owner.setAuth(authenticated());
    await waitForCallCount(harness.registration.calls, 1);
    const purge = harness.owner.purgeIdentity();
    pending.resolve(registrationResponse(harness.registration.calls[0]!));
    await reconcile;
    await purge;
    expect(harness.owner.current().registration).toBe("idle");
  });

  it("ignores A PUT after B becomes current and registers B with current token", async () => {
    const harness = pushHarness();
    const response = deferred<ReturnType<typeof registrationResponse>>();
    harness.registration.responsePromise = response.promise;
    const accountA = harness.owner.setAuth(authenticated(1));
    await waitForCallCount(harness.registration.calls, 1);
    expect(harness.registration.calls).toHaveLength(1);
    await harness.owner.setAuth(loggedOut(2));
    const accountB = harness.owner.setAuth(authenticated(3));
    expect(harness.registration.calls).toHaveLength(1);
    response.resolve(registrationResponse(harness.registration.calls[0]!));
    await accountA;
    await accountB;
    expect(harness.platform.getTokenCalls).toBe(2);
    expect(harness.registration.calls.at(-1)?.installationId).toBe(
      fakeInstallationId,
    );
    harness.registration.responsePromise = undefined;
    harness.platform.token = fakeTokenTwo;
    await harness.owner.reconcile("authentication");
    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenTwo);
    expect(harness.owner.current().registration).toBe("confirmed");
  });

  it("ignores an explicitly stale token callback", async () => {
    const harness = await authenticatedHarness();
    await harness.owner.setAuth(loggedOut(2));
    await harness.owner.setAuth(authenticated(3));
    const currentCalls = harness.registration.calls.length;
    await harness.owner.receiveToken(fakeTokenTwo, 1);
    expect(harness.registration.calls).toHaveLength(currentCalls);
    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenOne);
  });

  it("installs lifecycle listeners once and removes them on dispose", () => {
    const harness = pushHarness();
    harness.owner.start();
    expect(harness.platform.presentationStarts).toBe(1);
    harness.owner.dispose();
    expect(harness.platform.presentationStops).toBe(1);
    expect(harness.platform.tokenRemoveCalls).toBe(1);
    expect(harness.platform.foregroundRemoveCalls).toBe(1);
  });
});

describe("Native foreground push attention", () => {
  it("accepts one valid active current-generation receipt and deduplicates it", async () => {
    const harness = await authenticatedHarness();
    harness.owner.setForeground(true);
    harness.owner.receiveForeground(validWirePayload(), 1);
    harness.owner.receiveForeground(validWirePayload(), 1);
    expect(harness.owner.current().attentionIntentIds).toEqual([fakeIntentId]);
  });

  it("ignores invalid, logged-out, stale-generation, and background receipts", async () => {
    const harness = await authenticatedHarness();
    harness.owner.setForeground(true);
    harness.owner.receiveForeground({ ...validWirePayload(), taskId: "x" }, 1);
    harness.owner.receiveForeground(validWirePayload(), 0);
    harness.owner.setForeground(false);
    harness.owner.receiveForeground(validWirePayload(), 1);
    harness.owner.setAuth(loggedOut());
    harness.owner.receiveForeground(validWirePayload(), 2);
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
  });
});
