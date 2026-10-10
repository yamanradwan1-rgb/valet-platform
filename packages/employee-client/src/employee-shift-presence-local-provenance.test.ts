import { expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  presenceFixture,
  deferred,
  settlePresence,
  presenceIds,
} from "./employee-shift-presence-test-fixture";
import type { PresenceDescriptor } from "./employee-shift-presence-types";

it("descriptor persisted before challenge has no failure or manager eligibility after restart", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  let descriptor!: PresenceDescriptor;
  s.store.write.mockImplementationOnce(async (value) => {
    descriptor = value;
    s.session.suspend();
  });
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  expect(s.transport.challenge).not.toHaveBeenCalled();
  expect(s.acquisition.acquire).not.toHaveBeenCalled();
  const fresh = presenceFixture("REQUIRE_OR_OVERRIDE", "START", 100);
  fresh.transport.recover.mockResolvedValue({
    state: "EXPIRED",
    operationId: descriptor.operationId,
  });
  fresh.session.restore(descriptor);
  await expect(fresh.session.run(s.target)).rejects.toBeDefined();
  expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
    descriptor.operationId,
  );
  expect(fresh.session.snapshot().overrideReason).toBeNull();
  await fresh.session.requestManager();
  expect(fresh.transport.requestException).not.toHaveBeenCalled();
});

it("failure after acquisition completed cannot fabricate acquisition-failure provenance", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockResolvedValue({
    latitude: 1,
    longitude: 2,
    accuracyMeters: -1,
    capturedAt: "2026-10-04T10:00:01Z",
  });
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  expect(s.session.descriptor()).not.toHaveProperty("localFailure");
  expect(s.session.snapshot().overrideReason).toBeNull();
  expect(s.store.write).toHaveBeenCalledOnce();
  expect(s.transport.submit).not.toHaveBeenCalled();
  await s.session.requestManager();
  expect(s.transport.requestException).not.toHaveBeenCalled();
});

it.each(["before", "during"])(
  "crash %s acquisition has no invented failure and requires explicit fresh acquisition",
  async (crashPhase) => {
    const s = presenceFixture("REQUIRE_OR_OVERRIDE");
    const acquisition =
      deferred<Awaited<ReturnType<typeof s.acquisition.acquire>>>();
    const challenge = deferred<ReturnType<typeof s.challenge>>();
    if (crashPhase === "before") {
      s.transport.challenge.mockImplementationOnce(async (intent) => {
        await challenge.promise;
        return { ...s.challenge(), operationId: intent.operationId };
      });
    } else s.acquisition.acquire.mockReturnValueOnce(acquisition.promise);
    const sent = s.session.run(s.target);
    const caught = expect(sent).rejects.toBeDefined();
    await settlePresence();
    const descriptor = s.session.descriptor()!;
    s.session.suspend();
    if (crashPhase === "before") challenge.resolve(s.challenge());
    else acquisition.reject(new Error("process lost"));
    await caught;
    expect(s.transport.submit).not.toHaveBeenCalled();
    expect(Object.keys(descriptor).sort()).toEqual([
      "operationId",
      "stage",
      "target",
      "version",
    ]);
    const fresh = presenceFixture("REQUIRE_OR_OVERRIDE", "START", 100);
    fresh.transport.recover.mockResolvedValue({
      state: "PENDING",
      operationId: descriptor.operationId,
      exceptionId: null,
    });
    fresh.transport.readChallenge.mockResolvedValue({
      ...s.challenge(),
      operationId: descriptor.operationId,
    });
    fresh.session.restore(descriptor);
    await expect(fresh.session.run(s.target)).rejects.toMatchObject({
      status: 422,
    });
    expect(fresh.session.snapshot()).toMatchObject({
      phase: "unavailable",
      overrideReason: null,
    });
    expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
    await fresh.session.requestManager();
    expect(fresh.transport.requestException).not.toHaveBeenCalled();
    await fresh.session.run(s.target);
    expect(fresh.acquisition.acquire).toHaveBeenCalledOnce();
    expect(fresh.session.descriptor()!.operationId).not.toBe(
      descriptor.operationId,
    );
  },
);

it.each(["LOCATION_UNAVAILABLE", "GPS_UNAVAILABLE"] as const)(
  "observed %s survives restart truthfully and is gated by current mode",
  async (reason) => {
    const s = presenceFixture("REQUIRE_OR_OVERRIDE");
    s.acquisition.acquire.mockRejectedValue(
      new EmployeeApiError({
        code: reason,
        message: "Controlled acquisition failure",
        status: 422,
      }),
    );
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const descriptor = s.session.descriptor()!;
    expect(descriptor).toMatchObject({ stage: "LOCAL", localFailure: reason });
    expect(s.store.write).toHaveBeenLastCalledWith(descriptor);
    for (const mode of [
      "OFF",
      "WARN_ONLY",
      "REQUIRE",
      "REQUIRE_OR_OVERRIDE",
    ] as const) {
      const fresh = presenceFixture(mode, "START", 100);
      fresh.transport.recover.mockResolvedValue({
        state: "PENDING",
        operationId: descriptor.operationId,
        exceptionId: null,
      });
      fresh.transport.readChallenge.mockImplementation(async () => ({
        ...s.challenge(),
        presence: { ...s.challenge().presence, mode },
      }));
      fresh.session.restore(descriptor);
      await expect(fresh.session.run(s.target)).rejects.toMatchObject({
        status: 422,
      });
      expect(fresh.session.snapshot().overrideReason).toBe(
        mode === "REQUIRE_OR_OVERRIDE" ? reason : null,
      );
      await fresh.session.requestManager();
      expect(fresh.transport.requestException).toHaveBeenCalledTimes(
        mode === "REQUIRE_OR_OVERRIDE" ? 1 : 0,
      );
      if (mode === "REQUIRE_OR_OVERRIDE")
        expect(fresh.transport.requestException).toHaveBeenCalledWith(
          descriptor.operationId,
          presenceIds.challenge,
          reason,
        );
      expect(fresh.transport.submit).not.toHaveBeenCalled();
      expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
    }
    expect(Object.keys(descriptor).sort()).toEqual([
      "localFailure",
      "operationId",
      "stage",
      "target",
      "version",
    ]);
  },
);
