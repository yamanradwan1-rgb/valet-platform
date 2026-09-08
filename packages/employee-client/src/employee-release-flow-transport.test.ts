import { describe, expect, it, vi } from "vitest";

import {
  EmployeeClient,
  type EmployeeTransportRequest,
} from "./employee-client";
import { createEmployeeReleaseTransport } from "./employee-release-flow-transport";
import { completion } from "./employee-release-flow-test-fixture";
import { ids } from "./employee-operational-test-fixture";

describe("Employee final release HTTP transport", () => {
  it("uses the accepted Staff route and exact complete-handoff body", async () => {
    const requests: EmployeeTransportRequest[] = [];
    const client = new EmployeeClient({
      transport: {
        execute: vi.fn(async (request) => {
          requests.push(request);
          return { payload: completion(), status: 200 };
        }),
      },
    });
    await createEmployeeReleaseTransport(client).complete(ids.session, 8);
    expect(requests).toEqual([
      {
        body: { expectedSessionVersion: 8 },
        method: "POST",
        path: `/v1/staff/valet-sessions/${ids.session}/complete-handoff`,
      },
    ]);
  });

  it.each([
    { ...completion(), extra: true },
    { ...completion(), retrievalRequestStatus: "ACCEPTED" },
    { ...completion(), sessionVersion: 0 },
    { ...completion(), taskStatus: "IN_PROGRESS" },
  ])("rejects malformed 2xx terminal authority %#", async (payload) => {
    const client = new EmployeeClient({
      transport: { execute: async () => ({ payload, status: 200 }) },
    });
    await expect(
      createEmployeeReleaseTransport(client).complete(ids.session, 8),
    ).rejects.toMatchObject({ code: "RELEASE_RESPONSE_INVALID", status: 502 });
  });
});
