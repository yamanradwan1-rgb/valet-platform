import { expect, it } from "vitest";
import {
  deferred,
  presenceFixture,
  settlePresence,
} from "./employee-shift-presence-test-fixture";

it.each(["OFF", "WARN_ONLY", "REQUIRE"] as const)(
  "%s lost response recovers only exact O, no replay or recapture",
  async (mode) => {
    const s = presenceFixture(mode);
    s.transport.submit.mockRejectedValue(s.fail());
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const id = s.session.descriptor()!.operationId;
    s.transport.recover.mockRejectedValueOnce(s.fail());
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    expect(s.session.snapshot().phase).toBe("uncertain");
    await expect(s.session.run(s.target)).resolves.toEqual(s.result);
    expect(s.transport.recover).toHaveBeenCalledWith(id);
    expect(s.transport.submit).toHaveBeenCalledOnce();
    expect(s.acquisition.acquire).toHaveBeenCalledTimes(mode === "OFF" ? 0 : 1);
  },
);

it("fences old acquisition through A-B-A and never submits", async () => {
  const s = presenceFixture("REQUIRE");
  const old = deferred<Awaited<ReturnType<typeof s.acquisition.acquire>>>();
  s.acquisition.acquire.mockReturnValueOnce(old.promise);
  const first = s.session.run(s.target);
  const caught = expect(first).rejects.toBeDefined();
  await settlePresence();
  s.session.observeTarget({ ...s.target, locationId: "B" });
  s.session.observeTarget(s.target);
  old.resolve({
    latitude: 8,
    longitude: 9,
    accuracyMeters: 1,
    capturedAt: "2026-10-04T10:00:01Z",
  });
  await caught;
  expect(s.transport.submit).not.toHaveBeenCalled();
  await s.session.run(s.target);
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it("background before POST retires fix, foreground has no automatic GPS", async () => {
  const s = presenceFixture("WARN_ONLY");
  const old = deferred<Awaited<ReturnType<typeof s.acquisition.acquire>>>();
  s.acquisition.acquire.mockReturnValue(old.promise);
  const result = s.session.run(s.target);
  const caught = expect(result).rejects.toBeDefined();
  await settlePresence();
  s.session.suspend();
  old.resolve({
    latitude: 8,
    longitude: 9,
    accuracyMeters: 1,
    capturedAt: "2026-10-04T10:00:01Z",
  });
  await caught;
  expect(s.transport.submit).not.toHaveBeenCalled();
  expect(s.acquisition.acquire).toHaveBeenCalledOnce();
});

it("background after possible POST keeps O and fences old successful response", async () => {
  const s = presenceFixture();
  const old = deferred<typeof s.result>();
  s.transport.submit.mockReturnValue(old.promise);
  const result = s.session.run(s.target);
  const caught = expect(result).rejects.toBeDefined();
  await settlePresence();
  const id = s.session.descriptor()!.operationId;
  s.session.suspend();
  old.resolve(s.result);
  await caught;
  expect(s.session.snapshot().phase).toBe("uncertain");
  await s.session.run(s.target);
  expect(s.transport.recover).toHaveBeenCalledWith(id);
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it("process restart uses only descriptor and exact GET", async () => {
  const s = presenceFixture();
  s.transport.submit.mockRejectedValue(s.fail());
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  const descriptor = s.session.descriptor()!;
  const fresh = presenceFixture();
  fresh.transport.recover.mockImplementation(async () => ({
    ...s.committed(),
  }));
  fresh.session.restore(descriptor);
  await expect(fresh.session.run(s.target)).resolves.toEqual(s.result);
  expect(fresh.transport.challenge).not.toHaveBeenCalled();
  expect(fresh.transport.submit).not.toHaveBeenCalled();
  expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
});

it("logout makes old status inert", async () => {
  const s = presenceFixture();
  s.transport.submit.mockRejectedValue(s.fail());
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  const read = deferred<ReturnType<typeof s.committed>>();
  s.transport.recover.mockReturnValue(read.promise);
  const result = s.session.run(s.target);
  const caught = expect(result).rejects.toBeDefined();
  s.revoke();
  s.session.clear();
  read.resolve(s.committed());
  await caught;
  expect(s.session.snapshot().phase).toBe("idle");
});
