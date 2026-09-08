import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import {
  markReadyResult,
  openRetrieval,
  retrievalDetail,
  retrievalHarness,
  retrievalTask,
  startRetrievalResult,
  type MarkReadyResponseFixture,
} from "./employee-retrieval-flow-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";

const otherTaskId = "77777777-7777-4777-8777-777777777777";

async function confirmedRetrieval() {
  const harness = retrievalHarness();
  await openRetrieval(harness.session);
  harness.session.enterKeySlot("K-9");
  harness.session.confirmKeySlot();
  return harness;
}

describe("Employee Retrieval authority and response fences", () => {
  it("rejects a stale Task/session projection before exposing an action", async () => {
    const { session } = retrievalHarness(
      retrievalTask({ valetSessionVersion: 4 }),
      retrievalDetail({ version: 5 }),
    );
    await openRetrieval(session);
    expect(session.current().phase).toBe("conflict");
  });

  it("fails closed when the authoritative Key Slot is unavailable", async () => {
    const { session } = retrievalHarness(
      retrievalTask(),
      retrievalDetail({ keySlot: null }),
    );
    await openRetrieval(session);
    expect(session.current().phase).toBe("conflict");
  });

  it("reconciles a mismatched Start response without replaying the command", async () => {
    const { session, transport } = await confirmedRetrieval();
    transport.startResults.push(
      Promise.resolve(startRetrievalResult({ taskId: otherTaskId })),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [retrievalTask()] }));
    transport.sessionResults.push(Promise.resolve(retrievalDetail()));

    await session.startRetrieval();

    expect(transport.startCalls).toHaveLength(1);
    expect(session.current()).toMatchObject({
      keyConfirmed: false,
      phase: "key-checkout",
    });
  });

  it("coalesces rapid Mark Ready taps into one protected command", async () => {
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
    const pending = deferred<MarkReadyResponseFixture>();
    transport.markReadyResults.push(pending.promise);

    const first = session.markReady();
    const second = session.markReady();

    expect(first).toBe(second);
    expect(transport.markReadyCalls).toHaveLength(1);
    pending.resolve(markReadyResult());
    await first;
  });

  it("requires explicit action after a lost non-committed Mark Ready", async () => {
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

    await session.markReady();

    expect(transport.markReadyCalls).toHaveLength(1);
    expect(session.current().phase).toBe("retrieving");
  });

  it("reconciles a mismatched Ready response and ignores a late cleared result", async () => {
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
    transport.markReadyResults.push(
      Promise.resolve(markReadyResult({ taskVersion: 5 })),
    );
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
    await session.markReady();
    expect(transport.markReadyCalls).toHaveLength(1);
    expect(session.current().phase).toBe("retrieving");

    const late = deferred<MarkReadyResponseFixture>();
    transport.markReadyResults.push(late.promise);
    const command = session.markReady();
    session.clear();
    late.resolve(markReadyResult({ sessionId: ids.session }));
    await command;
    expect(session.current().phase).toBe("inactive");
  });
});
