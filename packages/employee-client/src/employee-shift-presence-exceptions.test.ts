import { expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  presenceFixture,
  presenceIds,
} from "./employee-shift-presence-test-fixture";

it("local failure uses pending O, approval requires explicit continuation", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(
    new EmployeeApiError({
      code: "LOCATION_UNAVAILABLE",
      message: "Denied",
      status: 422,
    }),
  );
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  const id = s.session.descriptor()!.operationId;
  expect(s.session.snapshot().overrideReason).toBe("LOCATION_UNAVAILABLE");
  await s.session.requestManager();
  expect(s.transport.requestException).toHaveBeenCalledExactlyOnceWith(
    id,
    presenceIds.challenge,
    "LOCATION_UNAVAILABLE",
  );
  s.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: id,
    exceptionId: presenceIds.exception,
  });
  await s.session.checkStatus();
  expect(s.session.snapshot().phase).toBe("approved");
  expect(s.transport.submit).not.toHaveBeenCalled();
  await s.session.run(s.target);
  expect(s.transport.submit).toHaveBeenCalledWith(s.target, id, {
    kind: "EXCEPTION",
    operationId: id,
    challengeId: presenceIds.challenge,
    exceptionId: presenceIds.exception,
  });
});

it.each([
  ["CONFIDENT_OUTSIDE", "OUTSIDE", "OUTSIDE_ZONE"],
  ["AMBIGUOUS_EDGE", "EDGE", "AMBIGUOUS_FIX"],
  ["MEASUREMENT_UNUSABLE", "INACCURATE_FIX", "GPS_UNAVAILABLE"],
] as const)(
  "terminal measured %s A creates fresh B only by employee choice",
  async (classification, reason, override) => {
    const s = presenceFixture("REQUIRE_OR_OVERRIDE", "END");
    s.transport.submit.mockRejectedValueOnce(
      new EmployeeApiError({
        code: "PRESENCE_REJECTED",
        message: "Rejected",
        status: 422,
      }),
    );
    s.transport.recover.mockImplementation(async () => {
      const value = s.committed();
      return {
        ...value,
        state: "RECOVERABLE",
        action: "END",
        status: "DENIED",
        result: null,
        denialReason: "PRESENCE_REJECTED",
        summary: { classification, reason },
      };
    });
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const a = s.session.descriptor()!.operationId;
    expect(s.transport.requestException).not.toHaveBeenCalled();
    await s.session.requestManager();
    const b = s.session.descriptor()!.operationId;
    expect(b).not.toBe(a);
    expect(s.transport.challenge).toHaveBeenCalledTimes(2);
    expect(s.transport.requestException).toHaveBeenCalledExactlyOnceWith(
      b,
      presenceIds.challenge,
      override,
    );
  },
);

it("configuration denial never labels employee outside or offers manager fallback", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.transport.submit.mockRejectedValueOnce(
    new EmployeeApiError({
      code: "PRESENCE_REJECTED",
      message: "Rejected",
      status: 422,
    }),
  );
  s.transport.recover.mockImplementation(async () => ({
    ...s.committed(),
    state: "RECOVERABLE",
    action: "START",
    status: "DENIED",
    result: null,
    denialReason: "PRESENCE_REJECTED",
    summary: {
      classification: "CONFIGURATION_UNUSABLE",
      reason: "NO_ACTIVE_ZONE",
    },
  }));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  expect(s.session.snapshot().overrideReason).toBeNull();
  await s.session.requestManager();
  expect(s.transport.requestException).not.toHaveBeenCalled();
});

it("lost Exception acknowledgement recovers exact selector without another POST", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  s.transport.requestException.mockRejectedValue(s.fail());
  await s.session.requestManager();
  const id = s.session.descriptor()!.operationId;
  s.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: id,
    exceptionId: presenceIds.exception,
  });
  await s.session.checkStatus();
  expect(s.transport.readException).toHaveBeenCalledWith(presenceIds.exception);
  expect(s.transport.requestException).toHaveBeenCalledOnce();
  expect(s.transport.submit).not.toHaveBeenCalled();
});

it.each(["REJECTED", "EXPIRED", "CONSUMED"] as const)(
  "%s approval cannot submit",
  async (status) => {
    const s = presenceFixture("REQUIRE_OR_OVERRIDE");
    s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    await s.session.requestManager();
    const id = s.session.descriptor()!.operationId;
    s.transport.recover.mockResolvedValue({
      state: "PENDING",
      operationId: id,
      exceptionId: presenceIds.exception,
    });
    s.transport.readException.mockResolvedValue(s.exception(status));
    await s.session.checkStatus();
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    expect(s.transport.submit).not.toHaveBeenCalled();
  },
);

it("manager request rechecks current mode", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  s.transport.readChallenge.mockImplementation(async () => ({
    ...s.challenge(),
    presence: { mode: "REQUIRE", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  }));
  await s.session.requestManager();
  expect(s.transport.requestException).not.toHaveBeenCalled();
  expect(s.session.snapshot().mode).toBe("REQUIRE");
});
