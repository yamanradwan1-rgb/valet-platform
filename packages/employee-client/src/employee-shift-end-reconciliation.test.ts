import type { EndShiftResponse } from "@valet/contracts";
import { expect, it } from "vitest";
import { endRecoveryFixture } from "./employee-shift-end-recovery-fixture";
import {
  deferred,
  settlePresence,
} from "./employee-shift-presence-test-fixture";
import type { PresenceRecovery } from "./employee-shift-presence-types";

it("settles lost END response once from exact GET, preserving cash and acknowledgment", async () => {
  const s = endRecoveryFixture();
  const descriptor = await s.loseResponse();
  expect(s.parent.current().phase).toBe("uncertain");
  await s.parent.checkPresenceStatus();
  expect(s.transport.recover).toHaveBeenCalledExactlyOnceWith(
    descriptor.operationId,
  );
  expect(s.parent.current()).toMatchObject({
    phase: "ended",
    cashInput: "1.000",
    result: s.result,
  });
  expect(s.onEnded).toHaveBeenCalledExactlyOnceWith(s.result);
  await Promise.all([
    s.parent.checkPresenceStatus(),
    s.parent.retry(),
    s.session.checkStatus(),
  ]);
  expect(s.onEnded).toHaveBeenCalledOnce();
  expect(s.transport.submit).toHaveBeenCalledOnce();
  expect(s.legacyEnd).not.toHaveBeenCalled();
  expect(s.store.delete).toHaveBeenCalled();
  s.parent.observeOperationalContext(1, { contexts: [] });
  expect(s.parent.current().phase).toBe("ended");
  s.parent.acknowledgeEndedPresentation();
  expect(s.parent.current().phase).toBe("inactive");
});

it("historical outside denial releases parent only after fresh same-shift context, then uses new OFF policy", async () => {
  const s = endRecoveryFixture("REQUIRE_OR_OVERRIDE");
  const descriptor = await s.loseResponse();
  s.transport.recover.mockResolvedValue(s.denied());
  const fresh = deferred<typeof s.context>();
  s.loadOperationalContext.mockReturnValueOnce(fresh.promise);
  const check = s.parent.checkPresenceStatus();
  await settlePresence();
  expect(s.parent.current().phase).toBe("uncertain");
  expect(s.session.snapshot().checkStatus).toBe("checking");
  expect(s.transport.submit).toHaveBeenCalledOnce();
  fresh.resolve(s.context);
  await check;
  expect(s.parent.current()).toMatchObject({
    phase: "active",
    cashInput: "1.000",
    result: null,
  });
  expect(s.session.snapshot()).toMatchObject({
    phase: "denied",
    reason: "PRESENCE_REJECTED",
    summary: s.denied().summary,
    mode: null,
  });
  expect(s.onEnded).not.toHaveBeenCalled();
  const issueChallenge = s.transport.challenge.getMockImplementation()!;
  s.transport.challenge.mockImplementation(async (intent) => ({
    ...(await issueChallenge(intent)),
    presence: { mode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  }));
  s.parent.requestConfirmation();
  await Promise.all([s.parent.endShift(), s.parent.endShift()]);
  expect(s.parent.current().phase).toBe("ended");
  expect(s.session.descriptor()!.operationId).not.toBe(descriptor.operationId);
  expect(s.transport.submit).toHaveBeenCalledTimes(2);
  expect(s.acquisition.acquire).toHaveBeenCalledOnce();
  expect(s.transport.requestException).not.toHaveBeenCalled();
});

it.each(["expired", "denied"] as const)(
  "%s needs exact current authority before a new attempt",
  async (status) => {
    for (const context of [
      "same",
      "missing",
      "foreign",
      "ambiguous",
      "unavailable",
    ] as const) {
      const s = endRecoveryFixture();
      const descriptor = await s.loseResponse();
      s.transport.recover.mockResolvedValue(
        status === "denied"
          ? s.denied()
          : { state: "EXPIRED", operationId: descriptor.operationId },
      );
      if (context === "missing")
        s.loadOperationalContext.mockResolvedValue({ contexts: [] });
      if (context === "foreign") s.context.contexts[0]!.membershipId = "other";
      if (context === "ambiguous")
        s.context.contexts.push({ ...s.context.contexts[0]! });
      if (context === "unavailable")
        s.loadOperationalContext.mockRejectedValue(s.fail());
      await s.parent.checkPresenceStatus();
      expect(s.parent.current().phase).toBe(
        context === "same" ? "active" : "uncertain",
      );
      expect(s.parent.current().cashInput).toBe("1.000");
      expect(s.parent.current().result).toBeNull();
      s.parent.requestConfirmation();
      if (context !== "same") {
        expect(s.session.snapshot().checkStatus).toBe("context-required");
        await s.parent.retry();
      }
      expect(s.transport.submit).toHaveBeenCalledOnce();
    }
  },
);

it.each([
  "missing",
  "cash",
  "currency",
  "shift",
  "start",
  "location",
  "variance",
  "malformed",
])(
  "COMMITTED with %s evidence stays unresolved and retains durable descriptor",
  async (kind) => {
    const s = endRecoveryFixture();
    const descriptor = await s.loseResponse();
    const recovery = structuredClone(s.committed());
    const result = recovery.result as EndShiftResponse;
    if (kind === "missing") recovery.result = null;
    if (kind === "cash") result.cashReconciliation.cashReported = "865.000";
    if (kind === "currency") result.cashReconciliation.currency = "USD";
    if (kind === "shift") result.shiftId = "other";
    if (kind === "start") result.startedAt = "2026-10-03T10:00:00Z";
    if (kind === "location") result.locationId = "other";
    if (kind === "variance") result.cashReconciliation.cashVariance = "1.000";
    if (kind === "malformed")
      delete (result as Partial<typeof result>).cashReconciliation;
    s.transport.recover.mockResolvedValue(recovery);
    s.store.delete.mockClear();
    await s.parent.checkPresenceStatus();
    expect(s.parent.current().phase).toBe("uncertain");
    expect(s.session.snapshot().phase).toBe("uncertain");
    expect(s.session.descriptor()).toEqual(descriptor);
    expect(s.store.delete).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
    await s.parent.retry();
    expect(s.transport.submit).toHaveBeenCalledOnce();
  },
);

it("PENDING without exception never replays, allocates or recaptures", async () => {
  const s = endRecoveryFixture();
  const descriptor = await s.loseResponse();
  s.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: descriptor.operationId,
    exceptionId: null,
  });
  await s.parent.checkPresenceStatus();
  expect(s.session.snapshot().checkStatus).toBe("pending");
  await s.parent.retry();
  expect(s.parent.current().phase).toBe("uncertain");
  expect(s.session.descriptor()).toEqual(descriptor);
  expect(s.transport.challenge).toHaveBeenCalledOnce();
  expect(s.transport.submit).toHaveBeenCalledOnce();
  expect(s.acquisition.acquire).not.toHaveBeenCalled();
});

it.each(["PENDING", "APPROVED", "EXPIRED", "REJECTED", "CONSUMED"] as const)(
  "%s manager exception is never Shift success",
  async (status) => {
    const s = endRecoveryFixture("REQUIRE_OR_OVERRIDE");
    const descriptor = await s.loseResponse();
    const exception = s.exception(status);
    s.transport.recover.mockResolvedValue({
      state: "PENDING",
      operationId: descriptor.operationId,
      exceptionId: exception.exceptionId,
    });
    s.transport.readException.mockResolvedValue(exception);
    await s.parent.checkPresenceStatus();
    expect(s.parent.current().phase).toBe(
      ["EXPIRED", "REJECTED"].includes(status) ? "active" : "uncertain",
    );
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(s.transport.submit).toHaveBeenCalledOnce();
    if (status === "APPROVED") {
      await s.parent.retry();
      expect(s.transport.submit).toHaveBeenCalledOnce();
      await s.parent.continuePresence();
      expect(s.transport.submit).toHaveBeenCalledTimes(2);
      expect(s.parent.current().phase).toBe("ended");
      expect(s.acquisition.acquire).toHaveBeenCalledOnce();
    }
  },
);

it.each(["committed", "denied", "expired"] as const)(
  "restart %s recovers exact descriptor without POST",
  async (status) => {
    const old = endRecoveryFixture();
    const descriptor = await old.loseResponse();
    const fresh = endRecoveryFixture();
    const response: PresenceRecovery =
      status === "committed"
        ? old.committed()
        : status === "denied"
          ? old.denied()
          : { state: "EXPIRED", operationId: descriptor.operationId };
    fresh.transport.recover.mockResolvedValue(response);
    await fresh.parent.resumePresenceRecovery(
      old.parent.current().authority!,
      "1.000",
      () => fresh.session.restore(descriptor),
    );
    expect(fresh.parent.current().phase).toBe(
      status === "committed" ? "ended" : "active",
    );
    expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
      descriptor.operationId,
    );
    expect(fresh.transport.submit).not.toHaveBeenCalled();
    expect(fresh.transport.challenge).not.toHaveBeenCalled();
    expect(fresh.store.delete).toHaveBeenCalled();
  },
);

it("preserves exact 865.123 JOD recovery and rejects a previous Shift with identical cash", async () => {
  const s = endRecoveryFixture();
  s.parent.setCashInput("865.123");
  if (!("cashReconciliation" in s.result)) throw Error("END fixture required");
  s.result.cashReconciliation = {
    ...s.result.cashReconciliation,
    cashReported: "865.123",
    cashExpected: "865.000",
    cashVariance: "0.123",
  };
  const descriptor = await s.loseResponse();
  const previous = structuredClone(s.committed());
  previous.result!.shiftId = "previous-shift";
  s.transport.recover.mockResolvedValueOnce(previous);
  await s.parent.checkPresenceStatus();
  expect(s.parent.current().phase).toBe("uncertain");
  expect(s.parent.current().cashInput).toBe("865.123");
  expect(s.session.descriptor()).toEqual(descriptor);
  await s.parent.checkPresenceStatus();
  expect(s.parent.current().phase).toBe("ended");
  expect(s.onEnded).toHaveBeenCalledExactlyOnceWith(s.result);
  expect(s.transport.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ cashReported: "865.123" }),
    descriptor.operationId,
    undefined,
  );
});
