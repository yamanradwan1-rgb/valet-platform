import { describe, expect, it } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import {
  completion,
  openRelease,
  payment,
  releaseDetail,
  releaseHarness,
  releaseTask,
} from "./employee-release-flow-test-fixture";
import { handoffScope } from "./employee-handoff-flow-test-fixture";
import { deferred } from "./employee-operational-test-fixture";

const otherTask = "77777777-7777-4777-8777-777777777777";

describe("Employee guarded final release (MOB-014B)", () => {
  it("presents verified release eligibility without treating it as authority", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    expect(release.current()).toMatchObject({
      block: null,
      completion: null,
      phase: "ready",
      releaseSatisfied: true,
      session: { state: "HANDOFF_PENDING", version: 8 },
      task: { status: "IN_PROGRESS", version: 4 },
    });
    expect(transport.calls).toEqual(["session", "queue", "payment"]);
    expect(JSON.stringify(release.current())).not.toMatch(
      /pickupCode|qrPayload|vhq1\./,
    );
  });

  it("does not offer release to the supervisor override actor who is not Task owner", async () => {
    const supervisor = { ...handoffScope, role: "VALET_SUPERVISOR" as const };
    const { release, transport } = releaseHarness(
      releaseTask({
        currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      }),
      releaseDetail({
        handoff: {
          pendingAt: "2026-09-08T09:10:00.000Z",
          verification: {
            method: "SUPERVISOR_OVERRIDE",
            status: "VERIFIED",
            verifiedAt: "2026-09-08T09:12:00.000Z",
          },
        },
      }),
    );
    await openRelease(release, supervisor);
    expect(release.current()).toMatchObject({
      block: "authority",
      phase: "blocked",
    });
    expect(transport.calls).toEqual(["session", "queue"]);
    await release.release();
    expect(transport.calls).not.toContain("complete");
  });

  it("truthfully blocks the current owner on the staff financial projection", async () => {
    const { release, transport } = releaseHarness(
      releaseTask(),
      releaseDetail(),
      payment(false),
    );
    await openRelease(release);
    expect(release.current()).toMatchObject({
      block: "financial",
      phase: "blocked",
      releaseRequiresPayment: true,
      releaseSatisfied: false,
    });
    await release.release();
    expect(transport.calls).not.toContain("complete");
  });

  it("coalesces rapid release taps and adopts only the exact terminal result", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    const result = deferred<ReturnType<typeof completion>>();
    transport.completeResults.push(result.promise);
    const first = release.release();
    const second = release.release();
    expect(first).toBe(second);
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
    result.resolve(completion());
    await first;
    expect(release.current()).toMatchObject({
      completion: {
        retrievalRequestStatus: "COMPLETED",
        taskStatus: "COMPLETED",
      },
      phase: "released",
      session: { state: "COMPLETED", version: 9 },
      task: null,
    });
  });

  it("reconciles a malformed or mismatched 2xx without adopting local release", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(
      Promise.resolve({ ...completion(), taskId: otherTask }),
    );
    transport.sessionResults.push(Promise.resolve(releaseDetail()));
    transport.queueResults.push(Promise.resolve({ tasks: [releaseTask()] }));
    transport.paymentResults.push(Promise.resolve(payment()));
    await release.release();
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
    expect(release.current()).toMatchObject({
      completion: null,
      phase: "ready",
      session: { state: "HANDOFF_PENDING" },
    });
  });

  it("reconciles an invalid-shaped 2xx without sending complete-handoff again", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "RELEASE_RESPONSE_INVALID",
          message: "The vehicle release response was invalid.",
          status: 502,
        }),
      ),
    );
    transport.sessionResults.push(Promise.resolve(releaseDetail()));
    transport.queueResults.push(Promise.resolve({ tasks: [releaseTask()] }));
    transport.paymentResults.push(Promise.resolve(payment()));
    await release.release();
    expect(release.current().phase).toBe("ready");
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });

  it("recovers COMMITTED completion after response loss even when Task disappeared", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(Promise.reject(employeeNetworkError()));
    transport.sessionResults.push(
      Promise.resolve(
        releaseDetail({
          handoff: { pendingAt: null, verification: null },
          keySlot: null,
          state: "COMPLETED",
          version: 9,
        }),
      ),
    );
    await release.release();
    expect(release.current()).toMatchObject({ phase: "released", task: null });
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
    expect(transport.calls.slice(-1)).toEqual(["session"]);
  });

  it("never blindly replays after an unknown result and allows only explicit retry", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(Promise.reject(employeeNetworkError()));
    transport.sessionResults.push(Promise.resolve(releaseDetail()));
    transport.queueResults.push(Promise.resolve({ tasks: [releaseTask()] }));
    transport.paymentResults.push(Promise.resolve(payment()));
    await release.release();
    expect(release.current().phase).toBe("ready");
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
    transport.completeResults.push(Promise.resolve(completion()));
    await release.release();
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      2,
    );
  });

  it("stays read-only ambiguous when the authoritative reread also fails", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(Promise.reject(employeeNetworkError()));
    transport.sessionResults.push(Promise.reject(employeeNetworkError()));
    await release.release();
    expect(release.current().phase).toBe("ambiguous");
    await release.release();
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });

  it("keeps a definite proof-policy rejection blocked", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "HANDOFF_VERIFICATION_FAILED",
          message: "Handoff verification failed.",
          status: 409,
        }),
      ),
    );
    await release.release();
    expect(release.current()).toMatchObject({
      block: "verification",
      phase: "blocked",
    });
  });

  it("keeps a definite financial rejection blocked without ambiguous replay", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "FINANCIAL_RELEASE_NOT_SATISFIED",
          message: "The financial release requirement is not satisfied.",
          status: 409,
        }),
      ),
    );
    await release.release();
    expect(release.current()).toMatchObject({
      block: "financial",
      phase: "blocked",
    });
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });

  it("shows a definite stale lifecycle rejection as conflict", async () => {
    const { release, transport } = releaseHarness();
    await openRelease(release);
    transport.completeResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "TASK_INVALID_STATE",
          message: "The Retrieval Task is not in the required state.",
          status: 409,
        }),
      ),
    );
    await release.release();
    expect(release.current()).toMatchObject({ block: null, phase: "conflict" });
    expect(transport.calls.filter((call) => call === "complete")).toHaveLength(
      1,
    );
  });
});
