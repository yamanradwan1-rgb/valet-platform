import { describe, expect, it } from "vitest";
import { EmployeeApiError, employeeNetworkError } from "@valet/employee-client";

import {
  authenticated,
  fakeTokenTwo,
  pushHarness,
} from "./native-push-fixture";

describe("Native push registration failure classification", () => {
  it("retries current desired state after a real network failure", async () => {
    const harness = pushHarness();
    harness.registration.failure = employeeNetworkError();
    await harness.owner.setAuth(authenticated());
    expect(harness.owner.current().registration).toBe("network-unavailable");

    harness.registration.failure = undefined;
    harness.platform.token = fakeTokenTwo;
    await harness.owner.networkRecovered();

    expect(harness.registration.calls.at(-1)?.providerToken).toBe(fakeTokenTwo);
    expect(harness.owner.current().registration).toBe("confirmed");
  });

  it("maps HTTP conflict to reconciliation failure, not connectivity", async () => {
    const harness = pushHarness();
    harness.registration.failure = new EmployeeApiError({
      code: "STAFF_PUSH_REGISTRATION_CONFLICT",
      message: "synthetic safe conflict",
      status: 409,
    });

    await harness.owner.setAuth(authenticated());

    expect(harness.owner.current().registration).toBe("registration-error");
  });

  it("distinguishes token acquisition unavailability", async () => {
    const harness = pushHarness();
    harness.platform.getCurrentToken = async () => {
      harness.platform.getTokenCalls += 1;
      throw new Error("synthetic token unavailable");
    };

    await harness.owner.setAuth(authenticated());

    expect(harness.owner.current().registration).toBe("token-unavailable");
    expect(harness.registration.calls).toHaveLength(0);
  });
});
