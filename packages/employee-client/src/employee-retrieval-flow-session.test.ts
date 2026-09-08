import { describe, expect, it } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import {
  markReadyResult,
  openRetrieval,
  retrievalDetail,
  retrievalHarness,
  retrievalScope,
  retrievalTask,
  startRetrievalResult,
  type StartRetrievalResponseFixture,
} from "./employee-retrieval-flow-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";

describe("Employee Retrieval workflow session (MOB-013)", () => {
  it("hydrates the canonical REQUESTED key-checkout stage with the expected Key Slot", async () => {
    const { session } = retrievalHarness();
    await openRetrieval(session);
    expect(session.current()).toMatchObject({
      keyConfirmed: false,
      keySlotCandidate: "",
      phase: "key-checkout",
      scope: retrievalScope,
    });
    expect(session.current().session?.keySlot?.code).toBe("K-9");
  });

  it("confirms the expected Key Slot with trim-only exact matching", async () => {
    const { session } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot(" K-9 ");
    expect(session.confirmKeySlot()).toBe(true);
    expect(session.current().keyConfirmed).toBe(true);

    const other = retrievalHarness();
    await openRetrieval(other.session);
    other.session.enterKeySlot("k-9");
    expect(other.session.confirmKeySlot()).toBe(false);
    expect(other.session.current().keyConfirmed).toBe(false);
  });

  it("blocks Start Retrieval until the expected Key Slot is confirmed", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(0);
  });

  it("forwards the exact session and Task versions to start-retrieval and adopts RETRIEVING", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(Promise.resolve(startRetrievalResult()));
    await session.startRetrieval();

    expect(transport.startCalls).toEqual([
      { sessionId: ids.session, sessionVersion: 5, taskVersion: 3 },
    ]);
    expect(session.current()).toMatchObject({
      phase: "retrieving",
      retrievalStartedAt: "2026-09-07T09:10:00.000Z",
      session: {
        parking: { parkingSpotCode: null },
        state: "RETRIEVING",
        version: 6,
      },
      task: {
        status: "IN_PROGRESS",
        valetSessionState: "RETRIEVING",
        valetSessionVersion: 6,
        version: 4,
      },
    });
  });

  it("coalesces rapid Start taps into one protected command", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    const pending = deferred<StartRetrievalResponseFixture>();
    transport.startResults.push(pending.promise);
    const first = session.startRetrieval();
    const second = session.startRetrieval();
    expect(first).toBe(second);
    expect(transport.startCalls).toHaveLength(1);
    pending.resolve(startRetrievalResult());
    await first;
  });

  it("marks the vehicle READY through mark-ready with the current session version", async () => {
    const { session, transport } = retrievalHarness(
      retrievalTask({
        status: "IN_PROGRESS",
        valetSessionState: "RETRIEVING",
        valetSessionVersion: 6,
        version: 4,
      }),
      retrievalDetail({ state: "RETRIEVING", version: 6 }),
    );
    await openRetrieval(session);
    expect(session.current().phase).toBe("retrieving");
    transport.markReadyResults.push(Promise.resolve(markReadyResult()));
    await session.markReady();
    expect(transport.markReadyCalls).toEqual([
      { sessionId: ids.session, version: 6 },
    ]);
    expect(session.current()).toMatchObject({
      phase: "ready",
      readyAt: "2026-09-07T09:20:00.000Z",
      session: { state: "READY", version: 7 },
      task: { status: "IN_PROGRESS", valetSessionState: "READY", version: 4 },
    });
  });

  it("reconciles response loss after commit to RETRIEVING without replaying start", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          retrievalTask({
            status: "IN_PROGRESS",
            valetSessionState: "RETRIEVING",
            valetSessionVersion: 6,
            version: 4,
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(retrievalDetail({ state: "RETRIEVING", version: 6 })),
    );
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(1);
    expect(session.current().phase).toBe("retrieving");
  });

  it("keeps an unresolvable response loss ambiguous and never blind-replays", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.reject(employeeNetworkError()));
    await session.startRetrieval();
    expect(session.current().phase).toBe("ambiguous");
    transport.queueResults.push(Promise.reject(employeeNetworkError()));
    await session.checkServerState();
    expect(transport.startCalls).toHaveLength(1);
    expect(session.current().phase).toBe("ambiguous");
  });

  it("offers an explicit retry only after recovery proves the pre-start state", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.resolve({ tasks: [retrievalTask()] }));
    transport.sessionResults.push(Promise.resolve(retrievalDetail()));
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(1);
    // Canonical reread proves the pre-start state again. The Key Slot
    // confirmation resets, so the employee re-verifies before the explicit
    // retry (Employee Web rehydration parity).
    expect(session.current().phase).toBe("key-checkout");
    expect(session.current().keyConfirmed).toBe(false);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(Promise.resolve(startRetrievalResult()));
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(2);
  });

  it("treats a reassignment to another employee as a conflict, never as stale continuation", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "TASK_NOT_FOUND_OR_FORBIDDEN",
          message: "not available",
          status: 409,
        }),
      ),
    );
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          retrievalTask({
            currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
          }),
        ],
      }),
    );
    transport.sessionResults.push(Promise.resolve(retrievalDetail()));
    await session.startRetrieval();
    expect(session.current().phase).toBe("conflict");
    expect(session.current().task?.currentAssigneeMembershipId).not.toBe(
      ids.membership,
    );
  });

  it("keeps a stale version conflict explicit instead of auto-retrying", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    transport.startResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "VERSION_CONFLICT",
          message: "changed by another operation",
          status: 409,
        }),
      ),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [retrievalTask()] }));
    transport.sessionResults.push(Promise.resolve(retrievalDetail()));
    await session.startRetrieval();
    expect(transport.startCalls).toHaveLength(1);
    // Canonical reread proves the pre-start state again; only an explicit
    // user action may send the protected command again.
    expect(session.current().phase).toBe("key-checkout");
  });

  it("resolves a recovered READY reread as the truthful terminal boundary", async () => {
    const { session, transport } = retrievalHarness(
      retrievalTask({
        status: "IN_PROGRESS",
        valetSessionState: "RETRIEVING",
        valetSessionVersion: 6,
        version: 4,
      }),
      retrievalDetail({ state: "RETRIEVING", version: 6 }),
    );
    await openRetrieval(session);
    transport.markReadyResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          retrievalTask({
            status: "IN_PROGRESS",
            valetSessionState: "READY",
            valetSessionVersion: 7,
            version: 4,
          }),
        ],
      }),
    );
    transport.sessionResults.push(
      Promise.resolve(retrievalDetail({ state: "READY", version: 7 })),
    );
    await session.markReady();
    expect(transport.markReadyCalls).toHaveLength(1);
    expect(session.current().phase).toBe("ready");
  });

  it("purges the workflow on scope clear and does not resurrect the prior target", async () => {
    const { session } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    session.clear();
    expect(session.current()).toMatchObject({
      phase: "inactive",
      scope: null,
      session: null,
      task: null,
    });
    await session.checkServerState();
    expect(session.current().phase).toBe("inactive");
  });

  it("ignores late responses after a newer request supersedes them", async () => {
    const { session, transport } = retrievalHarness();
    await openRetrieval(session);
    session.enterKeySlot("K-9");
    session.confirmKeySlot();
    const pending = deferred<StartRetrievalResponseFixture>();
    transport.startResults.push(pending.promise);
    const command = session.startRetrieval();
    session.clear();
    pending.resolve(startRetrievalResult());
    await command;
    expect(session.current().phase).toBe("inactive");
  });
});
