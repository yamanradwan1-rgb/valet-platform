import { afterEach, expect, it, vi } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  deferred,
  presenceFixture,
  settlePresence,
} from "./employee-shift-presence-test-fixture";
afterEach(() => vi.useRealTimers());

it.each([
  "identityGeneration",
  "membershipId",
  "organizationId",
  "locationId",
  "shiftId",
  "cashReported",
] as const)(
  "retires late End challenge after %s replacement",
  async (field) => {
    const s = presenceFixture("REQUIRE", "END");
    const late = deferred<ReturnType<typeof s.challenge>>();
    s.transport.challenge.mockReturnValue(late.promise);
    const first = s.session.run(s.target);
    const assertion = expect(first).rejects.toBeDefined();
    await settlePresence();
    s.session.observeTarget({
      ...s.target,
      [field]: field === "identityGeneration" ? 2 : "replacement",
    });
    late.resolve(s.challenge());
    await assertion;
    expect(s.acquisition.acquire).not.toHaveBeenCalled();
    expect(s.transport.submit).not.toHaveBeenCalled();
  },
);

it("target replacement during an active promise cannot join an old action", async () => {
  const s = presenceFixture("REQUIRE");
  const late = deferred<ReturnType<typeof s.challenge>>();
  s.transport.challenge.mockReturnValueOnce(late.promise);
  const first = s.session.run(s.target);
  const assertion = expect(first).rejects.toBeDefined();
  await settlePresence();
  const second = s.session.run({ ...s.target, identityGeneration: 2 });
  expect(second).not.toBe(first);
  late.resolve(s.challenge());
  await assertion;
  await second;
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it("Retry-After fences acquisition, status reads and manager writes", async () => {
  vi.useFakeTimers();
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  s.transport.challenge.mockRejectedValueOnce(
    new EmployeeApiError({
      code: "SHIFT_PRESENCE_RATE_LIMITED",
      message: "Slow down",
      status: 429,
      retryAfter: 4,
    }),
  );
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  await expect(s.session.run(s.target)).rejects.toMatchObject({ status: 429 });
  await s.session.checkStatus();
  await s.session.requestManager();
  expect(s.transport.recover).not.toHaveBeenCalled();
  expect(s.transport.requestException).not.toHaveBeenCalled();
  expect(s.acquisition.acquire).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4000);
  await s.session.run(s.target);
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it("old approval after cash change cannot reach the new action", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE", "END");
  s.acquisition.acquire.mockRejectedValue(new Error("unavailable"));
  await expect(s.session.run(s.target)).rejects.toBeDefined();
  await s.session.requestManager();
  const id = s.session.descriptor()!.operationId;
  const late = deferred<ReturnType<typeof s.exception>>();
  s.transport.recover.mockResolvedValue({
    state: "PENDING",
    operationId: id,
    exceptionId: s.exception().exceptionId,
  });
  s.transport.readException.mockReturnValue(late.promise);
  const check = s.session.checkStatus();
  await settlePresence();
  s.session.observeTarget({ ...s.target, cashReported: "2" });
  late.resolve(s.exception("APPROVED"));
  await check;
  expect(s.session.snapshot().phase).toBe("idle");
  expect(s.transport.submit).not.toHaveBeenCalled();
});
