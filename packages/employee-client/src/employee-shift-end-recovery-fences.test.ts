import { expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import { endRecoveryFixture } from "./employee-shift-end-recovery-fixture";
import {
  deferred,
  presenceFixture,
  settlePresence,
} from "./employee-shift-presence-test-fixture";
import type { PresenceRecovery } from "./employee-shift-presence-types";

it("double taps across Retry/status/child check send one GET and no POST", async () => {
  const s = endRecoveryFixture();
  await s.loseResponse();
  const response = deferred<PresenceRecovery>();
  s.transport.recover.mockReturnValue(response.promise);
  const first = s.parent.checkPresenceStatus();
  const second = s.parent.retry();
  const third = s.parent.checkPresenceStatus();
  expect(await s.session.checkStatus()).toMatchObject({ status: "blocked" });
  expect(s.session.snapshot().checkStatus).toBe("checking");
  expect(s.transport.recover).toHaveBeenCalledOnce();
  response.resolve(s.committed());
  await Promise.all([first, second, third]);
  expect(s.onEnded).toHaveBeenCalledOnce();
  expect(s.transport.submit).toHaveBeenCalledOnce();
  expect(s.session.snapshot().checkStatus).not.toBe("checking");
});

it.each([
  "logout",
  "auth",
  "membership",
  "organization",
  "location",
  "shift",
  "period",
  "currency",
  "background",
  "scope",
  "A-B-A",
])("late GET after %s cannot settle old parent", async (change) => {
  const s = endRecoveryFixture();
  await s.loseResponse();
  const response = deferred<PresenceRecovery>();
  s.transport.recover.mockReturnValue(response.promise);
  const check = s.parent.checkPresenceStatus();
  if (change === "logout") {
    s.revoke();
    s.parent.clear();
  } else if (change === "auth") s.parent.activate(2);
  else if (change === "background") s.parent.suspendForBackground();
  else if (change === "scope") s.parent.fenceOperationalScope();
  else {
    const original = structuredClone(s.context);
    const current = s.context.contexts[0]!;
    if (change === "membership" || change === "A-B-A")
      current.membershipId = "other";
    if (change === "organization")
      current.organization.organizationId = "other";
    if (change === "location") current.currentLocation!.locationId = "other";
    if (change === "shift") current.activeShift!.shiftId = "other";
    if (change === "period")
      current.activeShift!.startedAt = "2026-10-05T10:00:00Z";
    if (change === "currency") current.currentLocation!.currency = "USD";
    s.parent.observeOperationalContext(1, s.context);
    if (change === "A-B-A") s.parent.observeOperationalContext(1, original);
  }
  response.resolve(s.committed());
  await check;
  expect(s.parent.current().phase).not.toBe("ended");
  expect(s.onEnded).not.toHaveBeenCalled();
  expect(s.transport.submit).toHaveBeenCalledOnce();
  expect(s.session.snapshot().checkStatus).not.toBe("checking");
});

it.each(["logout", "membership", "background"])(
  "late context after %s cannot grant new authority",
  async (change) => {
    const s = endRecoveryFixture();
    await s.loseResponse();
    s.transport.recover.mockResolvedValue(s.denied());
    const context = deferred<typeof s.context>();
    s.loadOperationalContext.mockReturnValue(context.promise);
    const check = s.parent.checkPresenceStatus();
    await settlePresence();
    if (change === "logout") s.parent.clear();
    else if (change === "membership") {
      s.context.contexts[0]!.membershipId = "other";
      s.parent.observeOperationalContext(1, s.context);
    } else s.parent.suspendForBackground();
    context.resolve(s.context);
    await check;
    s.parent.requestConfirmation();
    await s.parent.endShift();
    expect(s.transport.submit).toHaveBeenCalledOnce();
    expect(s.onEnded).not.toHaveBeenCalled();
  },
);

it.each([502, 503, 408, "network", "unexpected"])(
  "%s check failure keeps original operation and cash",
  async (status) => {
    const s = endRecoveryFixture();
    const descriptor = await s.loseResponse();
    s.transport.recover.mockRejectedValue(
      typeof status === "number"
        ? new EmployeeApiError({
            code: "UNAVAILABLE",
            message: "private detail",
            status,
          })
        : status === "network"
          ? s.fail()
          : new Error("private detail"),
    );
    await s.parent.checkPresenceStatus();
    expect(s.parent.current()).toMatchObject({
      phase: "uncertain",
      cashInput: "1.000",
      result: null,
    });
    expect(s.session.snapshot().checkStatus).toBe("unresolved");
    expect(s.session.descriptor()).toEqual(descriptor);
    expect(s.store.delete).toHaveBeenCalledTimes(1); // activation only
    expect(s.transport.submit).toHaveBeenCalledOnce();
  },
);

it("offline, missing descriptor, rate limit and concurrent operation are explicit outcomes", async () => {
  const empty = presenceFixture();
  expect(await empty.session.checkStatus()).toMatchObject({
    status: "no-attempt",
  });
  expect(empty.session.snapshot().checkStatus).toBe("no-attempt");
  const s = endRecoveryFixture();
  const descriptor = await s.loseResponse();
  s.setOnline(false);
  await s.parent.checkPresenceStatus();
  expect(s.session.snapshot().checkStatus).toBe("offline");
  expect(s.transport.recover).not.toHaveBeenCalled();
  s.setOnline(true);
  s.transport.recover.mockRejectedValue(
    new EmployeeApiError({
      code: "SHIFT_PRESENCE_RATE_LIMITED",
      message: "wait",
      status: 429,
      retryAfter: 60,
    }),
  );
  await s.parent.checkPresenceStatus();
  await s.parent.checkPresenceStatus();
  expect(s.session.snapshot().checkStatus).toBe("rate-limited");
  expect(s.transport.recover).toHaveBeenCalledOnce();
  expect(s.session.descriptor()).toEqual(descriptor);
  const running = presenceFixture();
  const challenge = deferred<ReturnType<typeof running.challenge>>();
  const originalChallenge =
    running.transport.challenge.getMockImplementation()!;
  running.transport.challenge.mockImplementation(async (intent) => {
    await originalChallenge(intent);
    return challenge.promise;
  });
  const action = running.session.run(running.target);
  expect(await running.session.checkStatus()).toMatchObject({
    status: "blocked",
  });
  await settlePresence();
  challenge.resolve(running.challenge());
  await action;
  expect(running.transport.recover).not.toHaveBeenCalled();
});

it("wrong operation ID cannot resolve the parent", async () => {
  const s = endRecoveryFixture();
  await s.loseResponse();
  s.transport.recover.mockResolvedValue({
    ...s.committed(),
    operationId: "different",
  });
  await s.parent.checkPresenceStatus();
  expect(s.parent.current().phase).toBe("uncertain");
  expect(s.onEnded).not.toHaveBeenCalled();
});

it("availability loss before lifecycle notification cannot adopt a late GET", async () => {
  const s = endRecoveryFixture();
  const descriptor = await s.loseResponse();
  const response = deferred<PresenceRecovery>();
  s.transport.recover.mockReturnValue(response.promise);
  const checking = s.parent.checkPresenceStatus();
  s.setOnline(false);
  response.resolve(s.committed());
  await checking;
  expect(s.parent.current().phase).toBe("uncertain");
  expect(s.session.descriptor()).toEqual(descriptor);
  expect(s.onEnded).not.toHaveBeenCalled();
});

it("a different cash descriptor is rejected before GET or durable cleanup", async () => {
  const s = endRecoveryFixture();
  const original = await s.loseResponse();
  const different = {
    ...original,
    target: { ...original.target, cashReported: "865" },
  };
  s.session.clear(false);
  s.session.restore(different);
  s.store.delete.mockClear();
  await s.parent.checkPresenceStatus();
  expect(s.parent.current()).toMatchObject({
    phase: "uncertain",
    cashInput: "1.000",
  });
  expect(s.transport.recover).not.toHaveBeenCalled();
  expect(s.store.delete).not.toHaveBeenCalled();
  expect(s.session.descriptor()).toEqual(different);
  expect(s.onEnded).not.toHaveBeenCalled();
});

it("missing child descriptor leaves parent uncertain with explicit no-attempt feedback", async () => {
  const s = endRecoveryFixture();
  await s.loseResponse();
  s.session.clear(false);
  await s.parent.checkPresenceStatus();
  expect(s.parent.current()).toMatchObject({
    phase: "uncertain",
    cashInput: "1.000",
  });
  expect(s.session.snapshot().checkStatus).toBe("no-attempt");
  expect(s.transport.recover).not.toHaveBeenCalled();
  expect(s.transport.submit).toHaveBeenCalledOnce();
});
