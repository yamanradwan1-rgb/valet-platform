import { describe, expect, it, vi } from "vitest";

import {
  EmployeeClient,
  type EmployeeTransportRequest,
} from "./employee-client";
import { createEmployeeHandoffTransport } from "./employee-handoff-flow-transport";
import { ids } from "./employee-operational-test-fixture";

const task = {
  sessionId: ids.session,
  sessionVersion: 9,
  state: "HANDOFF_PENDING",
  taskId: ids.task,
  taskStatus: "IN_PROGRESS",
  taskVersion: 4,
};

describe("Employee handoff HTTP transport", () => {
  it("uses only the accepted MOB-014A routes and exact bodies", async () => {
    const requests: EmployeeTransportRequest[] = [];
    const responses = [
      {
        ...task,
        sessionVersion: 8,
        handoffPendingAt: "2026-09-08T09:00:00.000Z",
      },
      {
        ...task,
        method: "PICKUP_CODE",
        verificationStatus: "VERIFIED",
        verifiedAt: "2026-09-08T09:01:00.000Z",
      },
      {
        ...task,
        method: "DYNAMIC_QR",
        verificationStatus: "VERIFIED",
        verifiedAt: "2026-09-08T09:01:00.000Z",
      },
      {
        ...task,
        method: "SUPERVISOR_OVERRIDE",
        verificationStatus: "VERIFIED",
        verifiedAt: "2026-09-08T09:01:00.000Z",
      },
      { ...task, state: "READY", sessionVersion: 9 },
    ];
    const client = new EmployeeClient({
      transport: {
        execute: vi.fn(async (request) => {
          requests.push(request);
          return { payload: responses.shift(), status: 200 };
        }),
      },
    });
    const transport = createEmployeeHandoffTransport(client);
    await transport.initiate(ids.session, 7);
    await transport.verifyPickupCode(ids.session, 8, "0123");
    await transport.verifyDynamicQr(ids.session, 8, `vhq1.${"A".repeat(43)}`);
    await transport.override(ids.session, 8, "reason");
    await transport.abort(ids.session, 8, "reason");
    expect(requests.map(({ body, path }) => ({ body, path }))).toEqual([
      {
        body: { expectedSessionVersion: 7 },
        path: `/v1/staff/valet-sessions/${ids.session}/initiate-handoff`,
      },
      {
        body: { expectedSessionVersion: 8, pickupCode: "0123" },
        path: `/v1/staff/valet-sessions/${ids.session}/verify-pickup-code`,
      },
      {
        body: {
          expectedSessionVersion: 8,
          qrPayload: `vhq1.${"A".repeat(43)}`,
        },
        path: `/v1/staff/valet-sessions/${ids.session}/verify-dynamic-qr`,
      },
      {
        body: { expectedSessionVersion: 8, reason: "reason" },
        path: `/v1/staff/valet-sessions/${ids.session}/supervisor-override-handoff`,
      },
      {
        body: { expectedSessionVersion: 8, reason: "reason" },
        path: `/v1/staff/valet-sessions/${ids.session}/abort-handoff`,
      },
    ]);
    expect(requests.some(({ path }) => path.includes("complete-handoff"))).toBe(
      false,
    );
  });

  it("rejects malformed success instead of advancing local authority", async () => {
    const client = new EmployeeClient({
      transport: {
        execute: async () => ({
          payload: { state: "HANDOFF_PENDING" },
          status: 200,
        }),
      },
    });
    await expect(
      createEmployeeHandoffTransport(client).initiate(ids.session, 7),
    ).rejects.toMatchObject({ code: "HANDOFF_RESPONSE_INVALID", status: 502 });
  });
});
