import { describe, expect, it } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import {
  handoffDetail,
  handoffHarness,
  handoffScope,
  handoffTask,
  openHandoff,
  pendingDetail,
  pendingTask,
} from "./employee-handoff-flow-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";

const pendingAt = "2026-09-08T09:10:00.000Z";
const verifiedAt = "2026-09-08T09:12:00.000Z";
const initiation = {
  handoffPendingAt: pendingAt,
  sessionId: ids.session,
  sessionVersion: 8,
  state: "HANDOFF_PENDING" as const,
  taskId: ids.task,
  taskStatus: "IN_PROGRESS" as const,
  taskVersion: 4,
};
const verified = (
  method: "PICKUP_CODE" | "DYNAMIC_QR" | "SUPERVISOR_OVERRIDE",
) => ({
  method,
  sessionId: ids.session,
  sessionVersion: 9,
  state: "HANDOFF_PENDING" as const,
  taskId: ids.task,
  taskStatus: "IN_PROGRESS" as const,
  taskVersion: 4,
  verificationStatus: "VERIFIED" as const,
  verifiedAt,
});
const aborted = {
  sessionId: ids.session,
  sessionVersion: 9,
  state: "READY" as const,
  taskId: ids.task,
  taskStatus: "IN_PROGRESS" as const,
  taskVersion: 4,
};

describe("Employee secure handoff workflow (MOB-014A)", () => {
  it("hydrates READY and adopts the exact initiate-handoff result", async () => {
    const { session, transport } = handoffHarness();
    await openHandoff(session);
    expect(session.current().phase).toBe("ready");
    transport.initiateResults.push(Promise.resolve(initiation));
    await session.initiate();
    expect(transport.calls).toEqual([{ name: "initiate" }]);
    expect(session.current()).toMatchObject({
      phase: "pending",
      session: { state: "HANDOFF_PENDING", version: 8 },
      task: { status: "IN_PROGRESS", version: 4 },
    });
  });

  it.each([
    ["pickup", "PICKUP_CODE", "0123"],
    ["qr", "DYNAMIC_QR", `vhq1.${"A".repeat(43)}`],
  ] as const)(
    "verifies %s proof without completing or releasing",
    async (name, method, proof) => {
      const { session, transport } = handoffHarness(
        pendingTask(),
        pendingDetail(),
      );
      await openHandoff(session);
      (name === "pickup" ? transport.pickupResults : transport.qrResults).push(
        Promise.resolve(verified(method)),
      );
      await (name === "pickup"
        ? session.verifyPickupCode(proof)
        : session.verifyDynamicQr(proof));
      expect(session.current()).toMatchObject({
        phase: "verified",
        session: {
          handoff: { verification: { method, status: "VERIFIED" } },
          state: "HANDOFF_PENDING",
        },
        task: { status: "IN_PROGRESS" },
      });
    },
  );

  it("allows a same-location supervisor override without Task ownership", async () => {
    const supervisor = { ...handoffScope, role: "VALET_SUPERVISOR" as const };
    const task = handoffTask({
      currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      valetSessionState: "HANDOFF_PENDING",
      valetSessionVersion: 8,
    });
    const { session, transport } = handoffHarness(task, pendingDetail());
    await openHandoff(session, supervisor);
    expect(session.current().phase).toBe("pending");
    transport.overrideResults.push(
      Promise.resolve(verified("SUPERVISOR_OVERRIDE")),
    );
    await session.override("  guest identity confirmed  ");
    expect(transport.calls.at(-1)).toEqual({
      name: "override",
      value: "guest identity confirmed",
    });
    expect(session.current().phase).toBe("verified");
  });

  it("rejects invalid-shaped proof locally and never retains raw proof", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    await session.verifyPickupCode("123");
    await session.verifyDynamicQr("not-a-proof");
    expect(transport.calls).toEqual([]);
    expect(JSON.stringify(session.current())).not.toContain("not-a-proof");
    expect(JSON.stringify(session.current())).not.toContain("0123");
  });

  it("denies local override authority to an ordinary employee and bounds reasons", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    await session.override("reason");
    await session.abort(" ");
    expect(transport.calls).toEqual([]);
  });

  it("aborts verified handoff back to READY while preserving Task work", async () => {
    const detail = pendingDetail();
    detail.handoff.verification = {
      method: "PICKUP_CODE",
      status: "VERIFIED",
      verifiedAt,
    };
    const { session, transport } = handoffHarness(pendingTask(), detail);
    await openHandoff(session);
    transport.abortResults.push(Promise.resolve(aborted));
    await session.abort("guest changed plans");
    expect(session.current()).toMatchObject({
      phase: "ready",
      session: {
        handoff: { pendingAt: null, verification: null },
        state: "READY",
      },
      task: { status: "IN_PROGRESS", version: 4 },
    });
  });

  it("coalesces rapid protected taps", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    const result = deferred<ReturnType<typeof verified>>();
    transport.pickupResults.push(result.promise);
    const first = session.verifyPickupCode("0123");
    const second = session.verifyPickupCode("0123");
    expect(first).toBe(second);
    expect(transport.calls).toHaveLength(1);
    result.resolve(verified("PICKUP_CODE"));
    await first;
  });

  it("reconciles response loss after commit without replaying proof", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    transport.pickupResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          handoffTask({
            valetSessionState: "HANDOFF_PENDING",
            valetSessionVersion: 9,
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(
        handoffDetail({
          handoff: {
            pendingAt,
            verification: {
              method: "PICKUP_CODE",
              status: "VERIFIED",
              verifiedAt,
            },
          },
          state: "HANDOFF_PENDING",
          version: 9,
        }),
      ),
    );
    await session.verifyPickupCode("0123");
    expect(transport.calls).toEqual([{ name: "pickup", value: "0123" }]);
    expect(session.current().phase).toBe("verified");
  });

  it("stays read-only ambiguous when canonical reread fails", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    transport.qrResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.reject(employeeNetworkError()));
    await session.verifyDynamicQr(`vhq1.${"A".repeat(43)}`);
    expect(session.current().phase).toBe("ambiguous");
    expect(transport.calls).toHaveLength(1);
  });

  it("rereads version conflicts and requires a fresh explicit action", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    transport.abortResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "VERSION_CONFLICT",
          message: "changed",
          status: 409,
        }),
      ),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [pendingTask()] }));
    transport.sessionResults.push(Promise.resolve(pendingDetail()));
    await session.abort("guest changed plans");
    expect(transport.calls).toHaveLength(1);
    expect(session.current().phase).toBe("pending");
  });

  it("treats a mismatched 2xx target as ambiguous and rereads canonical truth", async () => {
    const { session, transport } = handoffHarness();
    await openHandoff(session);
    transport.initiateResults.push(
      Promise.resolve({
        ...initiation,
        sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [handoffTask()] }));
    transport.sessionResults.push(Promise.resolve(handoffDetail()));
    await session.initiate();
    expect(transport.calls).toHaveLength(1);
    expect(session.current().phase).toBe("ready");
  });
});
