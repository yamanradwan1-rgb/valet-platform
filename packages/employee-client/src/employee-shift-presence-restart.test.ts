import { expect, it } from "vitest";
import {
  presenceFixture,
  presenceIds,
  deferred,
  settlePresence,
} from "./employee-shift-presence-test-fixture";
import type { PresenceDescriptor } from "./employee-shift-presence-types";

it("crash after descriptor persistence but before challenge reconciles and permits fresh explicit action", async () => {
  const s = presenceFixture("REQUIRE");
  let descriptor!: PresenceDescriptor;
  s.store.write.mockImplementationOnce(async (value) => {
    descriptor = value;
    s.session.suspend(); // The durable write survives; this process cannot continue.
  });
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  expect(descriptor.stage).toBe("LOCAL");
  expect(s.transport.challenge).not.toHaveBeenCalled();
  const fresh = presenceFixture("OFF", "START", 100);
  fresh.transport.recover.mockResolvedValue({
    state: "EXPIRED",
    operationId: descriptor.operationId,
  });
  fresh.session.restore(descriptor);
  await expect(fresh.session.run(s.target)).rejects.toMatchObject({
    status: 422,
  });
  expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
    descriptor.operationId,
  );
  expect(fresh.transport.submit).not.toHaveBeenCalled();
  await fresh.session.run(s.target);
  expect(fresh.transport.submit).toHaveBeenCalledOnce();
  expect(fresh.session.descriptor()!.operationId).not.toBe(
    descriptor.operationId,
  );
});

it("fencing during success cleanup still requires exact GET before adopting the result", async () => {
  const s = presenceFixture();
  const cleanup = deferred<void>();
  s.store.delete.mockReturnValueOnce(cleanup.promise);
  const sent = s.session.run(s.target);
  const caught = expect(sent).rejects.toBeDefined();
  await settlePresence();
  const operationId = s.session.descriptor()!.operationId;
  s.session.suspend();
  cleanup.resolve();
  await caught;
  expect(s.session.snapshot().phase).toBe("uncertain");
  await s.session.run(s.target);
  expect(s.transport.recover).toHaveBeenCalledExactlyOnceWith(operationId);
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it.each(["START", "END"] as const)(
  "%s may-have-left restart is exact GET only",
  async (action) => {
    const s = presenceFixture("OFF", action);
    s.transport.submit.mockRejectedValue(s.fail());
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const descriptor = s.session.descriptor()!;
    expect(descriptor.stage).toBe("SHIFT_MAY_HAVE_LEFT");
    const fresh = presenceFixture("OFF", action, 100);
    fresh.transport.recover.mockResolvedValue(s.committed());
    fresh.session.restore(descriptor);
    await fresh.session.run(s.target);
    expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
      descriptor.operationId,
    );
    expect(fresh.transport.submit).not.toHaveBeenCalled();
    expect(fresh.transport.challenge).not.toHaveBeenCalled();
    expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
  },
);

it("Exception lost acknowledgement survives restart through exact O and Exception GET", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.acquisition.acquire.mockRejectedValue(new Error("GPS unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  s.transport.requestException.mockRejectedValue(s.fail());
  await s.session.requestManager();
  const descriptor = s.session.descriptor()!;
  expect(descriptor.stage).toBe("EXCEPTION_MAY_HAVE_LEFT");
  await s.session.requestManager();
  expect(s.transport.requestException).toHaveBeenCalledOnce();
  const fresh = presenceFixture("REQUIRE_OR_OVERRIDE", "START", 100);
  fresh.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: descriptor.operationId,
    exceptionId: presenceIds.exception,
  });
  fresh.transport.readException.mockResolvedValue(s.exception());
  fresh.transport.readChallenge.mockResolvedValue(s.challenge());
  fresh.session.restore(descriptor);
  await expect(fresh.session.run(s.target)).rejects.toBeDefined();
  expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
    descriptor.operationId,
  );
  expect(fresh.transport.readException).toHaveBeenCalledExactlyOnceWith(
    presenceIds.exception,
  );
  expect(fresh.session.snapshot().phase).toBe("pending");
  expect(fresh.transport.requestException).not.toHaveBeenCalled();
  expect(fresh.transport.submit).not.toHaveBeenCalled();
  expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
  expect(Object.keys(descriptor).sort()).toEqual([
    "operationId",
    "stage",
    "target",
    "version",
  ]);
});

it.each(["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
  "recovered denial A explicitly creates B and uses current %s mode",
  async (mode) => {
    const s = presenceFixture("REQUIRE_OR_OVERRIDE");
    s.transport.submit.mockRejectedValue(s.fail());
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const descriptor = s.session.descriptor()!;
    const fresh = presenceFixture(mode, "START", 100);
    fresh.transport.recover.mockResolvedValue({
      ...s.committed(),
      status: "DENIED",
      result: null,
      denialReason: "PRESENCE_REJECTED",
      summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
    });
    fresh.session.restore(descriptor);
    await expect(fresh.session.run(s.target)).rejects.toBeDefined();
    expect(fresh.session.snapshot()).toMatchObject({
      phase: "denied",
      mode: null,
      overrideReason: "OUTSIDE_ZONE",
    });
    expect(fresh.transport.challenge).not.toHaveBeenCalled();
    await fresh.session.requestManager();
    const b = fresh.session.descriptor()!.operationId;
    expect(b).not.toBe(descriptor.operationId);
    expect(fresh.transport.challenge).toHaveBeenCalledOnce();
    expect(fresh.transport.readChallenge).toHaveBeenCalledExactlyOnceWith(b);
    expect(fresh.transport.requestException).toHaveBeenCalledTimes(
      mode === "REQUIRE_OR_OVERRIDE" ? 1 : 0,
    );
    expect(fresh.transport.submit).not.toHaveBeenCalled();
    expect(fresh.acquisition.acquire).not.toHaveBeenCalled();
  },
);

it.each(["START", "END"] as const)(
  "%s offline late outcome is ambiguous even before lifecycle notification",
  async (action) => {
    for (const outcome of ["resolve", "reject"] as const) {
      const s = presenceFixture("OFF", action);
      const late = deferred<typeof s.result>();
      s.transport.submit.mockReturnValue(late.promise);
      const result = s.session.run(s.target);
      const rejected = expect(result).rejects.toMatchObject({ status: 503 });
      await settlePresence();
      const descriptor = s.session.descriptor();
      s.setOnline(false);
      if (outcome === "resolve") late.resolve(s.result);
      else late.reject(s.fail());
      await rejected;
      expect(s.session.snapshot().phase).toBe("uncertain");
      expect(s.session.descriptor()).toEqual(descriptor);
      s.setOnline(true);
      await s.session.run(s.target);
      expect(s.transport.recover).toHaveBeenCalledExactlyOnceWith(
        descriptor!.operationId,
      );
      expect(s.transport.submit).toHaveBeenCalledOnce();
    }
  },
);
