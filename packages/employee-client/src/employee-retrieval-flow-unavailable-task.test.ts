import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "./api-error";
import {
  openRetrieval,
  retrievalDetail,
  retrievalHarness,
} from "./employee-retrieval-flow-test-fixture";

describe("Retrieval recovery when the exact Task is no longer in the queue", () => {
  it.each(["PARKED", "REQUESTED"] as const)(
    "blocks stale entry with a missing Task and a %s session",
    async (state) => {
      const { session, transport } = retrievalHarness();
      transport.queueResults = [Promise.resolve({ tasks: [] })];
      transport.sessionResults = [Promise.resolve(retrievalDetail({ state }))];

      await openRetrieval(session);

      expect(session.current()).toMatchObject({
        failure: null,
        keyConfirmed: false,
        phase: "conflict",
        task: null,
      });
      await session.startRetrieval();
      expect(transport.startCalls).toHaveLength(0);
    },
  );

  it("retires a mounted checkout when foreground reconciliation sees the task gone", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    expect(session.confirmKeySlot()).toBe(true);
    transport.queueResults.push(Promise.resolve({ tasks: [] }));
    transport.sessionResults.push(
      Promise.resolve(retrievalDetail({ state: "PARKED", version: 6 })),
    );

    session.suspendForBackground();
    await session.checkServerState();

    expect(session.current()).toMatchObject({
      failure: null,
      keyConfirmed: false,
      keySlotCandidate: "",
      phase: "conflict",
      session: { state: "PARKED", version: 6 },
      task: null,
    });
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(0);
  });

  it("keeps a concealed denial on the losing Start path non-actionable", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    expect(session.confirmKeySlot()).toBe(true);
    transport.startResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "TASK_NOT_FOUND_OR_FORBIDDEN",
          message: "The requested resource is not available.",
          status: 404,
        }),
      ),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [] }));
    transport.sessionResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "TENANT_ACCESS_DENIED",
          message: "The requested resource is not available.",
          status: 404,
        }),
      ),
    );

    await session.startRetrieval();

    expect(session.current()).toMatchObject({
      failure: { code: "TENANT_ACCESS_DENIED", status: 404 },
      phase: "conflict",
    });
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(1);
  });
});
