import { describe, expect, it } from "vitest";

import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";
import {
  authenticated,
  deferred,
  fakeTokenTwo,
  loggedOut,
  pushHarness,
  validWirePayload,
} from "./native-push-fixture";

async function authenticatedHarness() {
  const harness = pushHarness();
  await harness.owner.setForeground(true);
  await harness.owner.setAuth(authenticated());
  return harness;
}

describe("Native push identity purge barrier", () => {
  it("clears identity immediately and waits for deferred token deletion", async () => {
    const harness = await authenticatedHarness();
    harness.owner.receiveForeground(validWirePayload(), 1);
    const deletion = deferred<void>();
    harness.platform.deletePromise = deletion.promise;
    const registrationCount = harness.registration.calls.length;
    let completed = false;

    const purge = harness.owner.purgeIdentity().then(() => {
      completed = true;
    });

    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    expect(harness.owner.current().registration).toBe("idle");
    expect(harness.platform.deleteCalls).toBe(1);
    harness.platform.emitToken(fakeTokenTwo);
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(harness.registration.calls).toHaveLength(registrationCount);

    deletion.resolve();
    await purge;
    expect(completed).toBe(true);
  });

  it("holds B token acquisition behind A's token deletion", async () => {
    const harness = await authenticatedHarness();
    const boundary = new NativeIdentityStateBoundary();
    boundary.register(() => harness.owner.purgeIdentity());
    const deletion = deferred<void>();
    harness.platform.deletePromise = deletion.promise;
    harness.platform.token = fakeTokenTwo;

    const switchAccount = (async () => {
      await boundary.purge();
      await harness.owner.setAuth(loggedOut(2));
      await harness.owner.setAuth(authenticated(3));
    })();

    await Promise.resolve();
    expect(harness.platform.getTokenCalls).toBe(1);
    expect(harness.registration.calls).toHaveLength(1);

    deletion.resolve();
    await switchAccount;
    expect(harness.platform.getTokenCalls).toBe(2);
    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenTwo);
  });

  it("swallows deletion failure and lets B reconcile normally", async () => {
    const harness = await authenticatedHarness();
    const deletion = deferred<void>();
    harness.platform.deletePromise = deletion.promise;
    const purge = harness.owner.purgeIdentity();
    deletion.reject(new Error("synthetic local delete failure"));

    await expect(purge).resolves.toBeUndefined();
    harness.platform.deletePromise = undefined;
    harness.platform.token = fakeTokenTwo;
    await harness.owner.setAuth(loggedOut(2));
    await harness.owner.setAuth(authenticated(3));
    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenTwo);
    expect(harness.owner.current().registration).toBe("confirmed");
  });
});
