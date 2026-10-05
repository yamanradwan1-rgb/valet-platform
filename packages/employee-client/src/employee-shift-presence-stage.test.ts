import { expect, it } from "vitest";
import {
  presenceFixture,
  presenceIds,
} from "./employee-shift-presence-test-fixture";

it.each(["START", "END"] as const)(
  "durably marks %s before protected dispatch",
  async (action) => {
    const s = presenceFixture("OFF", action);
    s.transport.submit.mockImplementation(async () => {
      expect(s.store.write).toHaveBeenLastCalledWith(
        expect.objectContaining({ stage: "SHIFT_MAY_HAVE_LEFT" }),
      );
      return s.result;
    });
    await s.session.run(s.target);
    expect(s.store.write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ stage: "LOCAL" }),
    );
  },
);

it.each(["START", "END"] as const)(
  "failed %s dispatch-stage storage prevents POST",
  async (action) => {
    const s = presenceFixture("OFF", action);
    s.store.write
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage failed"));
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    expect(s.transport.submit).not.toHaveBeenCalled();
  },
);

it("failed Exception stage storage prevents Exception POST", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  s.store.write.mockRejectedValueOnce(new Error("storage failed"));
  await s.session.requestManager();
  expect(s.transport.requestException).not.toHaveBeenCalled();
});

it("local failure restart reconciles challenge and permits explicit manager action", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  const descriptor = s.session.descriptor()!;
  const fresh = presenceFixture("REQUIRE_OR_OVERRIDE");
  fresh.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: descriptor.operationId,
    exceptionId: null,
  });
  fresh.transport.readChallenge.mockResolvedValue(s.challenge());
  fresh.session.restore(descriptor);
  await expect(fresh.session.run(s.target)).rejects.toMatchObject({
    status: 422,
  });
  expect(fresh.session.snapshot()).toMatchObject({
    phase: "unavailable",
    overrideReason: "GPS_UNAVAILABLE",
  });
  expect(fresh.transport.submit).not.toHaveBeenCalled();
  expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
  await fresh.session.requestManager();
  expect(fresh.transport.requestException).toHaveBeenCalledExactlyOnceWith(
    descriptor.operationId,
    presenceIds.challenge,
    "GPS_UNAVAILABLE",
  );
});
