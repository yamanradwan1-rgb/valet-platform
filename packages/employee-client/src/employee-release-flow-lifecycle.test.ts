import { describe, expect, it } from "vitest";

import {
  completion,
  openRelease,
  payment,
  releaseDetail,
  releaseHarness,
  releaseTask,
} from "./employee-release-flow-test-fixture";
import { deferred } from "./employee-operational-test-fixture";

const otherTask = "77777777-7777-4777-8777-777777777777";

describe("Employee final release lifecycle fences", () => {
  it("fences a late release response after background and requires a reread", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const result = deferred<ReturnType<typeof completion>>();
    transport.completeResults.push(result.promise);
    const operation = release.release();
    release.suspendForBackground();
    expect(release.current().phase).toBe("ambiguous");
    result.resolve(completion());
    await operation;
    expect(release.current().phase).toBe("ambiguous");
    transport.sessionResults.push(
      Promise.resolve(
        releaseDetail({
          handoff: { pendingAt: null, verification: null },
          state: "COMPLETED",
          version: 9,
        }),
      ),
    );
    await release.checkServerState();
    expect(release.current().phase).toBe("released");
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });

  it("fences logout or workflow purge from a late successful response", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const result = deferred<ReturnType<typeof completion>>();
    transport.completeResults.push(result.promise);
    const operation = release.release();
    release.clear();
    result.resolve(completion());
    await operation;
    expect(release.current()).toMatchObject({
      phase: "inactive",
      session: null,
    });
  });

  it("reconciles reassignment instead of trusting the stale owner", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const reassigned = releaseTask({
      currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      version: 5,
    });
    transport.sessionResults.push(Promise.resolve(releaseDetail()));
    transport.queueResults.push(Promise.resolve({ tasks: [reassigned] }));
    await release.observeTaskAuthority(reassigned);
    expect(release.current()).toMatchObject({
      block: "authority",
      phase: "blocked",
    });
    await release.release();
    expect(transport.calls).not.toContain("complete");
  });

  it("stays ambiguous when authority changes during release and reread fails", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const result = deferred<ReturnType<typeof completion>>();
    transport.completeResults.push(result.promise);
    const operation = release.release();
    const reassigned = releaseTask({
      currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      version: 5,
    });
    transport.sessionResults.push(Promise.reject(new Error("read failed")));
    const reconciliation = release.observeTaskAuthority(reassigned);
    result.resolve(completion());
    await operation;
    await reconciliation;
    expect(release.current().phase).toBe("ambiguous");
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });

  it("fences a late response from a replaced session target", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const result = deferred<ReturnType<typeof completion>>();
    transport.completeResults.push(result.promise);
    const operation = release.release();
    const nextSession = "88888888-8888-4888-8888-888888888888";
    transport.sessionResults.push(
      Promise.resolve(releaseDetail({ sessionId: nextSession })),
    );
    transport.queueResults.push(
      Promise.resolve({
        tasks: [releaseTask({ sessionId: nextSession, taskId: otherTask })],
      }),
    );
    transport.paymentResults.push(Promise.resolve(payment()));
    const opened = release.openTask(
      9,
      release.current().scope!,
      otherTask,
      nextSession,
    );
    result.resolve(completion());
    await operation;
    await opened;
    expect(release.current()).toMatchObject({
      phase: "ready",
      session: { sessionId: nextSession },
      task: { taskId: otherTask },
    });
  });
});
