import { expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import { presenceFixture } from "./employee-shift-presence-test-fixture";

it.each(["START", "END"] as const)(
  "OFF %s has zero location calls and exact O",
  async (action) => {
    const s = presenceFixture("OFF", action);
    await expect(s.session.run(s.target)).resolves.toEqual(s.result);
    expect(s.acquisition.acquire).not.toHaveBeenCalled();
    const operationId = s.transport.challenge.mock.calls[0]![0].operationId;
    expect(s.transport.submit).toHaveBeenCalledExactlyOnceWith(
      s.target,
      operationId,
      undefined,
    );
  },
);

it.each(["WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
  "%s sends truthful fresh measured selectors",
  async (mode) => {
    const s = presenceFixture(mode);
    await s.session.run(s.target);
    const operationId = s.transport.challenge.mock.calls[0]![0].operationId;
    expect(s.transport.submit).toHaveBeenCalledWith(
      s.target,
      operationId,
      expect.objectContaining({ kind: "MEASURED", operationId }),
    );
    expect(JSON.stringify(s.store.write.mock.calls)).not.toMatch(
      /latitude|longitude|accuracyMeters|capturedAt|mocked|challengeId|measurement/,
    );
    expect(JSON.stringify(s.session.snapshot())).not.toMatch(
      /latitude|longitude|measurement/,
    );
  },
);

it.each([true, false, undefined])(
  "transmits mocked %s exactly",
  async (mocked) => {
    const s = presenceFixture("WARN_ONLY", "END");
    s.acquisition.acquire.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
      ...(mocked === undefined ? {} : { mocked }),
    });
    await s.session.run(s.target);
    const body = s.transport.submit.mock.calls[0]![2] as unknown as {
      measurement: object;
    };
    expect(body.measurement).toEqual(expect.objectContaining({ latitude: 1 }));
    expect("mocked" in body.measurement).toBe(mocked !== undefined);
    if (mocked !== undefined)
      expect(body.measurement).toHaveProperty("mocked", mocked);
  },
);

it.each(["START", "END"] as const)(
  "WARN_ONLY %s missing GPS uses same O without exception",
  async (action) => {
    const s = presenceFixture("WARN_ONLY", action);
    s.acquisition.acquire.mockRejectedValue(new Error("unavailable"));
    await s.session.run(s.target);
    expect(s.transport.submit).toHaveBeenCalledWith(
      s.target,
      s.transport.challenge.mock.calls[0]![0].operationId,
      undefined,
    );
    expect(s.transport.requestException).not.toHaveBeenCalled();
  },
);

it.each([
  "LOCATION_UNAVAILABLE",
  "LOCATION_SERVICES_DISABLED",
  "GPS_UNAVAILABLE",
])("REQUIRE %s does not mutate or offer override", async (code) => {
  const s = presenceFixture("REQUIRE");
  s.acquisition.acquire.mockRejectedValue(
    new EmployeeApiError({ code, message: "Unavailable", status: 422 }),
  );
  await expect(s.session.run(s.target)).rejects.toMatchObject({
    code: "GPS_UNAVAILABLE",
  });
  expect(s.transport.submit).not.toHaveBeenCalled();
  expect(s.session.snapshot().overrideReason).toBeNull();
});

it.each(["OFF", "WARN_ONLY"] as const)(
  "%s policy race consumes exact strict denial",
  async (mode) => {
    const s = presenceFixture(mode);
    s.transport.submit.mockRejectedValue(
      new EmployeeApiError({
        code: "PRESENCE_REQUIRED",
        message: "Required",
        status: 422,
      }),
    );
    s.transport.recover.mockImplementation(async () => ({
      ...s.committed(),
      status: "DENIED",
      denialReason: "PRESENCE_REQUIRED",
      result: null,
    }));
    await expect(s.session.run(s.target)).rejects.toMatchObject({
      code: "PRESENCE_REQUIRED",
    });
    expect(s.session.snapshot()).toMatchObject({
      phase: "denied",
      summary: null,
    });
  },
);
