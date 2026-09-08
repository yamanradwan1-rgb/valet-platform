import { describe, expect, it, vi } from "vitest";

import type { EmployeeClient } from "./employee-client";
import {
  markReadyResult,
  retrievalDetail,
  retrievalTask,
  startRetrievalResult,
} from "./employee-retrieval-flow-test-fixture";
import { createEmployeeRetrievalTransport } from "./employee-retrieval-flow-transport";
import { ids } from "./employee-operational-test-fixture";

describe("Employee Retrieval transport", () => {
  it("uses the accepted reads and exact protected command bodies", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ tasks: [retrievalTask()] })
      .mockResolvedValueOnce(retrievalDetail())
      .mockResolvedValueOnce(startRetrievalResult())
      .mockResolvedValueOnce(markReadyResult());
    const transport = createEmployeeRetrievalTransport({
      request,
    } as unknown as EmployeeClient);

    await transport.loadTaskQueue(ids.location);
    await transport.loadSession(ids.session);
    await transport.startRetrieval(ids.session, 5, 3);
    await transport.markReady(ids.session, 6);

    expect(request.mock.calls).toEqual([
      [
        {
          method: "GET",
          params: { locationId: ids.location },
          path: "/v1/staff/tasks/queue",
        },
      ],
      [{ method: "GET", path: `/v1/staff/valet-sessions/${ids.session}` }],
      [
        {
          body: { expectedSessionVersion: 5, expectedTaskVersion: 3 },
          method: "POST",
          path: `/v1/staff/valet-sessions/${ids.session}/start-retrieval`,
        },
      ],
      [
        {
          body: { expectedSessionVersion: 6 },
          method: "POST",
          path: `/v1/staff/valet-sessions/${ids.session}/mark-ready`,
        },
      ],
    ]);
  });

  it("rejects an invalid command response instead of fabricating state", async () => {
    const request = vi.fn().mockResolvedValue({
      ...startRetrievalResult(),
      taskStatus: "COMPLETED",
    });
    const transport = createEmployeeRetrievalTransport({
      request,
    } as unknown as EmployeeClient);

    await expect(
      transport.startRetrieval(ids.session, 5, 3),
    ).rejects.toMatchObject({
      code: "RETRIEVAL_RESPONSE_INVALID",
      status: 502,
    });
  });
});
