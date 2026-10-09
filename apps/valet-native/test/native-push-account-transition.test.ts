import { EmployeeApiError } from "@valet/employee-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} from "../src/telemetry/native-telemetry-owner";

import {
  authenticated,
  deferred,
  fakeTokenOne,
  fakeTokenTwo,
  loggedOut,
  pushHarness,
  registrationResponse,
} from "./native-push-fixture";

async function settleUntil(predicate: () => boolean) {
  for (let index = 0; index < 100 && !predicate(); index += 1)
    await Promise.resolve();
  expect(predicate()).toBe(true);
}

const conflict = () =>
  new EmployeeApiError({
    code: "STAFF_PUSH_REGISTRATION_CONFLICT",
    message: "Push registration cannot be reconciled.",
    status: 409,
  });

afterEach(() => resetNativeTelemetryRegistryForTests());

describe("Issue 273 A→B push account-transition source contract", () => {
  it("classifies a 409 conflict without logging A identity, token or server message", async () => {
    resetNativeTelemetryRegistryForTests();
    const ring = new BoundedTelemetryBuffer();
    installNativeTelemetry(
      new NativeTelemetryOwner(ring, {
        appBuild: "test",
        appVersion: "test",
        platform: "android",
      }),
    );
    const harness = pushHarness();
    harness.registration.failure = new EmployeeApiError({
      code: "STAFF_PUSH_REGISTRATION_CONFLICT",
      message: "synthetic private prior account and credential",
      status: 409,
    });
    await harness.owner.setAuth(authenticated(1));
    expect(harness.owner.current().registration).toBe("registration-error");
    expect(ring.current()).toContainEqual({
      classification: "registration-conflict",
      outcome: "error",
      source: "push",
    });
    expect(JSON.stringify(ring.current())).not.toContain("credential");
    expect(JSON.stringify(ring.current())).not.toContain(fakeTokenOne);
  });

  it("keeps B blocked if A logout was local-only and old ownership remains ACTIVE", async () => {
    const harness = pushHarness();
    let owner: "A" | "B" | null = "A";
    let caller: "A" | "B" = "A";
    harness.registration.reconcile = async (request) => {
      harness.registration.calls.push(request);
      if (owner !== null && owner !== caller) throw conflict();
      owner = caller;
      return registrationResponse(request);
    };

    await harness.owner.setAuth(authenticated(1));
    expect(owner).toBe("A");
    await harness.owner.purgeIdentity();
    await harness.owner.setAuth(loggedOut(2));
    caller = "B";
    harness.platform.token = fakeTokenTwo;
    await harness.owner.setAuth(authenticated(3));
    expect(owner).toBe("A");
    expect(harness.owner.current().registration).toBe("registration-error");
    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenTwo);

    owner = null; // Simulates a later confirmed server-side A revocation.
    await harness.owner.networkRecovered();
    expect(owner).toBe("B");
    expect(harness.owner.current().registration).toBe("confirmed");
    expect(harness.registration.calls).toHaveLength(3);
    expect(harness.platform.deleteCalls).toBe(1);
    // No unrelated Guest, Task, or protected-domain request exists in this harness.
  });

  it.each(["online", "lost-response-after-commit"] as const)(
    "allows B only after authoritative A release: %s",
    async () => {
      const harness = pushHarness();
      let owner: "A" | "B" | null = "A";
      let caller: "A" | "B" = "A";
      harness.registration.reconcile = async (request) => {
        harness.registration.calls.push(request);
        if (owner !== null && owner !== caller) throw conflict();
        owner = caller;
        return registrationResponse(request);
      };
      await harness.owner.setAuth(authenticated(1));
      await harness.owner.purgeIdentity();
      owner = null; // Server transaction won, even if client missed its response.
      await harness.owner.setAuth(loggedOut(2));
      caller = "B";
      harness.platform.token = fakeTokenTwo;
      await harness.owner.setAuth(authenticated(3));
      expect(owner).toBe("B");
      expect(harness.owner.current().registration).toBe("confirmed");
    },
  );

  it("fences a stale in-flight A response but allows B to begin without awaiting it", async () => {
    const harness = pushHarness();
    const stalledA = deferred<ReturnType<typeof registrationResponse>>();
    let caller: "A" | "B" = "A";
    harness.registration.reconcile = async (request) => {
      harness.registration.calls.push(request);
      if (caller === "A") return stalledA.promise;
      return registrationResponse(request);
    };
    const first = harness.owner.setAuth(authenticated(1));
    await settleUntil(() => harness.registration.calls.length === 1);
    await harness.owner.purgeIdentity();
    await harness.owner.setAuth(loggedOut(2));
    caller = "B";
    harness.platform.token = fakeTokenTwo;
    const second = harness.owner.setAuth(authenticated(3));
    // A's previous HTTP response may be lost indefinitely. B has new, independently
    // authenticated authority and must not wait on this obsolete UI/network promise.
    await settleUntil(() => harness.registration.calls.length === 2);
    expect(harness.owner.current().registration).toBe("confirmed");
    stalledA.resolve(registrationResponse({
      ...harness.registration.calls[0]!,
      providerToken: fakeTokenOne,
    }));
    await Promise.all([first, second]);
    expect(harness.registration.calls).toHaveLength(2);
    expect(harness.owner.current().registration).toBe("confirmed");
  });
});
