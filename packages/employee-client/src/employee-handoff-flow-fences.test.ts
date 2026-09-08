import { describe, expect, it } from "vitest";

import {
  handoffHarness,
  handoffTask,
  openHandoff,
  pendingDetail,
  pendingTask,
} from "./employee-handoff-flow-test-fixture";
import { deferred, ids } from "./employee-operational-test-fixture";

const verified = {
  method: "PICKUP_CODE" as const,
  sessionId: ids.session,
  sessionVersion: 9,
  state: "HANDOFF_PENDING" as const,
  taskId: ids.task,
  taskStatus: "IN_PROGRESS" as const,
  taskVersion: 4,
  verificationStatus: "VERIFIED" as const,
  verifiedAt: "2026-09-08T09:12:00.000Z",
};

describe("Employee handoff authority fences", () => {
  it("fences a late verified response after scope purge", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    const result = deferred<typeof verified>();
    transport.pickupResults.push(result.promise);
    const command = session.verifyPickupCode("0123");
    session.clear();
    result.resolve(verified);
    await command;
    expect(session.current().phase).toBe("inactive");
  });

  it("fences a late verification response behind a newer Task owner", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    const result = deferred<typeof verified>();
    transport.pickupResults.push(result.promise);
    const command = session.verifyPickupCode("0123");
    const reassigned = handoffTask({
      currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      valetSessionState: "HANDOFF_PENDING",
      valetSessionVersion: 8,
    });
    transport.queueResults.push(Promise.resolve({ tasks: [reassigned] }));
    transport.sessionResults.push(Promise.resolve(pendingDetail()));
    const reconciliation = session.observeTaskAuthority(reassigned);
    result.resolve(verified);
    await Promise.all([command, reconciliation]);
    expect(session.current().phase).toBe("conflict");
    expect(session.current().task?.currentAssigneeMembershipId).toBe(
      reassigned.currentAssigneeMembershipId,
    );
  });

  it("fences an in-flight proof response when the app backgrounds", async () => {
    const { session, transport } = handoffHarness(
      pendingTask(),
      pendingDetail(),
    );
    await openHandoff(session);
    const result = deferred<typeof verified>();
    transport.pickupResults.push(result.promise);
    const command = session.verifyPickupCode("0123");
    session.suspendForBackground();
    result.resolve(verified);
    await command;
    expect(session.current().phase).toBe("ambiguous");

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
      Promise.resolve({
        ...pendingDetail(),
        handoff: {
          pendingAt: "2026-09-08T09:10:00.000Z",
          verification: {
            method: "PICKUP_CODE",
            status: "VERIFIED",
            verifiedAt: verified.verifiedAt,
          },
        },
        version: 9,
      }),
    );
    await session.checkServerState();
    expect(session.current().phase).toBe("verified");
  });
});
