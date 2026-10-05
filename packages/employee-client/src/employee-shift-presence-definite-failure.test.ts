import { expect, it } from "vitest";
import { EmployeeApiError } from "./api-error";
import {
  presenceFixture,
  deferred,
  settlePresence,
} from "./employee-shift-presence-test-fixture";
import type { PresenceDescriptor } from "./employee-shift-presence-types";

it.each([
  ["END", "OPEN_TASK_HANDOFF_REQUIRED"],
  ["START", "ACTIVE_SHIFT_CONFLICT"],
  ["END", "SHIFT_CASH_REPORT_INVALID"],
] as const)(
  "%s definite %s is durably retired before restart",
  async (action, code) => {
    const s = presenceFixture("OFF", action);
    let durable: PresenceDescriptor | undefined;
    s.store.write.mockImplementation(async (value) => {
      durable = value;
    });
    s.store.delete.mockImplementation(async () => {
      durable = undefined;
    });
    s.transport.submit.mockRejectedValue(
      new EmployeeApiError({ code, message: "Definite failure", status: 409 }),
    );
    await expect(s.session.run(s.target)).rejects.toMatchObject({ code });
    const old = s.session.descriptor()!.operationId;
    expect(s.session.snapshot().phase).toBe("unavailable");
    expect(durable).toBeUndefined();
    const fresh = presenceFixture("OFF", action, 100);
    if (durable !== undefined) fresh.session.restore(durable);
    expect(fresh.session.snapshot().phase).toBe("idle");
    await fresh.session.run(s.target);
    expect(fresh.transport.recover).not.toHaveBeenCalled();
    expect(fresh.transport.submit).toHaveBeenCalledOnce();
    expect(fresh.session.descriptor()!.operationId).not.toBe(old);
  },
);

it("definite presentation waits for durable retirement, and storage failure stays uncertain", async () => {
  const s = presenceFixture("OFF", "END");
  s.transport.submit.mockRejectedValue(
    new EmployeeApiError({
      code: "OPEN_TASK_HANDOFF_REQUIRED",
      message: "Open work",
      status: 409,
    }),
  );
  const retirement = deferred<void>();
  s.store.delete.mockReturnValueOnce(retirement.promise);
  const sent = s.session.run(s.target);
  const caught = sent.catch((error: unknown) => error);
  await settlePresence();
  expect(s.session.snapshot().phase).toBe("submitting");
  retirement.reject(new Error("storage failed"));
  expect(await caught).toMatchObject({ status: 503 });
  expect(s.session.snapshot().phase).toBe("uncertain");
  expect(s.session.descriptor()!.stage).toBe("SHIFT_MAY_HAVE_LEFT");
  await s.session.run(s.target);
  expect(s.transport.recover).toHaveBeenCalledOnce();
  expect(s.transport.submit).toHaveBeenCalledOnce();
});

it("late retirement failure after logout cannot update the cleared coordinator", async () => {
  const s = presenceFixture();
  s.transport.submit.mockRejectedValue(
    new EmployeeApiError({
      code: "ACTIVE_SHIFT_CONFLICT",
      message: "Known failure",
      status: 409,
    }),
  );
  const retirement = deferred<void>();
  s.store.delete.mockReturnValueOnce(retirement.promise);
  const result = s.session.run(s.target).catch((error: unknown) => error);
  await settlePresence();
  s.revoke();
  s.session.clear();
  retirement.reject(new Error("late storage failure"));
  await result;
  expect(s.session.snapshot().phase).toBe("idle");
  expect(s.session.descriptor()).toBeUndefined();
});

it.each([0, 408, 500, 503])(
  "ambiguous status %s retains durable exact O",
  async (status) => {
    const s = presenceFixture("OFF", "END");
    s.transport.submit.mockRejectedValue(
      status === 0
        ? s.fail()
        : new EmployeeApiError({
            code: "UNKNOWN",
            message: "Unknown outcome",
            status,
          }),
    );
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const descriptor = s.session.descriptor()!;
    expect(descriptor.stage).toBe("SHIFT_MAY_HAVE_LEFT");
    expect(s.store.write).toHaveBeenLastCalledWith(descriptor);
    expect(s.store.delete).not.toHaveBeenCalled();
    const fresh = presenceFixture("OFF", "END", 100);
    fresh.transport.recover.mockResolvedValue(s.committed());
    fresh.session.restore(descriptor);
    await fresh.session.run(s.target);
    expect(fresh.transport.recover).toHaveBeenCalledExactlyOnceWith(
      descriptor.operationId,
    );
    expect(fresh.transport.submit).not.toHaveBeenCalled();
  },
);

it("late known rejection after lifecycle fence retains may-have-left O", async () => {
  const s = presenceFixture("OFF", "END");
  const late = deferred<typeof s.result>();
  s.transport.submit.mockReturnValueOnce(late.promise);
  const sent = s.session.run(s.target);
  const caught = expect(sent).rejects.toBeDefined();
  await settlePresence();
  const descriptor = s.session.descriptor()!;
  s.session.suspend();
  late.reject(
    new EmployeeApiError({
      code: "OPEN_TASK_HANDOFF_REQUIRED",
      message: "Late failure",
      status: 409,
    }),
  );
  await caught;
  expect(s.session.snapshot().phase).toBe("uncertain");
  expect(s.store.delete).not.toHaveBeenCalled();
  expect(s.session.descriptor()).toEqual(descriptor);
  expect(s.store.write).toHaveBeenLastCalledWith(descriptor);
});

it.each([
  "PRESENCE_REJECTED",
  "PRESENCE_REQUIRED",
  "APPROVER_AUTHORITY_REVOKED",
])(
  "%s still requires exact recovery and retains unknown marker",
  async (code) => {
    const s = presenceFixture();
    s.transport.submit.mockRejectedValue(
      new EmployeeApiError({
        code,
        message: "Presence terminal response",
        status: 422,
      }),
    );
    s.transport.recover.mockRejectedValue(s.fail());
    await expect(s.session.run(s.target)).rejects.toBeDefined();
    const descriptor = s.session.descriptor()!;
    expect(s.transport.recover).toHaveBeenCalledExactlyOnceWith(
      descriptor.operationId,
    );
    expect(descriptor.stage).toBe("SHIFT_MAY_HAVE_LEFT");
    expect(s.store.delete).not.toHaveBeenCalled();
  },
);
