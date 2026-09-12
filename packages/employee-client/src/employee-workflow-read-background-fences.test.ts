import { describe, expect, it } from "vitest";

import {
  activeParkingDetail,
  activeParkingTask,
  confirmParkedHarness,
} from "./employee-confirm-parked-test-fixture";
import {
  handoffDetail,
  handoffHarness,
  handoffTask,
} from "./employee-handoff-flow-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";
import {
  parkingStartDetail,
  parkingStartHarness,
  parkingStartScope,
  parkingStartTask,
} from "./employee-parking-start-test-fixture";
import {
  openRelease,
  payment,
  releaseDetail,
  releaseHarness,
  releaseTask,
} from "./employee-release-flow-test-fixture";
import {
  retrievalDetail,
  retrievalHarness,
  retrievalScope,
  retrievalTask,
} from "./employee-retrieval-flow-test-fixture";

describe("workflow safe-read background fences", () => {
  it("fences Parking canonical loading and permits a fresh foreground read", async () => {
    const { session, transport } = parkingStartHarness();
    const slow = deferred<{ tasks: ReturnType<typeof parkingStartTask>[] }>();
    transport.queueResults.splice(0, 1, slow.promise);
    const oldRead = session.openQueueTask(
      7,
      parkingStartScope,
      ids.task,
      ids.session,
    );
    session.suspendForBackground();
    slow.resolve({ tasks: [parkingStartTask()] });
    await oldRead;
    expect(session.current().phase).toBe("loading");

    transport.queueResults.push(
      Promise.resolve({ tasks: [parkingStartTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(parkingStartDetail()));
    await session.checkServerState();
    expect(session.current().phase).toBe("accepted");
    expect(transport.startCalls).toHaveLength(0);
  });

  it("fences Confirm Parked canonical loading and permits a fresh read", async () => {
    const { session, transport } = confirmParkedHarness();
    const slow = deferred<{ tasks: ReturnType<typeof activeParkingTask>[] }>();
    transport.queueResults.push(slow.promise);
    const oldRead = session.open(7, parkingStartScope, ids.task, ids.session);
    session.suspendForBackground();
    slow.resolve({ tasks: [activeParkingTask()] });
    await oldRead;
    expect(session.current().phase).toBe("loading");

    transport.queueResults.push(
      Promise.resolve({ tasks: [activeParkingTask()] }),
    );
    transport.sessionResults.push(Promise.resolve(activeParkingDetail()));
    await session.checkServerState();
    expect(session.current().phase).toBe("spot");
    expect(transport.confirmCalls).toHaveLength(0);
  });

  it("fences Retrieval canonical loading and permits a fresh read", async () => {
    const { session, transport } = retrievalHarness();
    const slow = deferred<{ tasks: ReturnType<typeof retrievalTask>[] }>();
    transport.queueResults.splice(0, 1, slow.promise);
    const oldRead = session.openQueueTask(
      9,
      retrievalScope,
      ids.task,
      ids.session,
    );
    session.suspendForBackground();
    slow.resolve({ tasks: [retrievalTask()] });
    await oldRead;
    expect(session.current().phase).toBe("loading");

    transport.queueResults.push(Promise.resolve({ tasks: [retrievalTask()] }));
    transport.sessionResults.push(Promise.resolve(retrievalDetail()));
    await session.checkServerState();
    expect(session.current().phase).toBe("key-checkout");
    expect(transport.startCalls).toHaveLength(0);
    expect(transport.markReadyCalls).toHaveLength(0);
  });

  it("fences Handoff initial loading and permits a fresh read", async () => {
    const { session, transport } = handoffHarness();
    const slow = deferred<{ tasks: ReturnType<typeof handoffTask>[] }>();
    transport.queueResults.splice(0, 1, slow.promise);
    const oldRead = session.openTask(9, retrievalScope, ids.task, ids.session);
    session.suspendForBackground();
    slow.resolve({ tasks: [handoffTask()] });
    await oldRead;
    expect(session.current().phase).toBe("loading");

    transport.queueResults.push(Promise.resolve({ tasks: [handoffTask()] }));
    transport.sessionResults.push(Promise.resolve(handoffDetail()));
    await session.checkServerState();
    expect(session.current().phase).toBe("ready");
    expect(transport.calls).toHaveLength(0);
  });

  it("fences Release initial loading and permits a fresh read", async () => {
    const { release, transport } = releaseHarness();
    const slow = deferred<ReturnType<typeof releaseDetail>>();
    transport.sessionResults.splice(0, 1, slow.promise);
    const oldRead = openRelease(release);
    release.suspendForBackground();
    slow.resolve(releaseDetail());
    await oldRead;
    expect(release.current().phase).toBe("loading");

    transport.sessionResults.push(Promise.resolve(releaseDetail()));
    transport.queueResults.push(Promise.resolve({ tasks: [releaseTask()] }));
    transport.paymentResults.push(Promise.resolve(payment()));
    await release.checkServerState();
    expect(release.current().phase).toBe("ready");
    expect(transport.calls).not.toContain("complete");
  });
});
