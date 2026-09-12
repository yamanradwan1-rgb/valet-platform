import { describe, expect, it } from "vitest";

import { EmployeeHandoffSession } from "./employee-handoff-flow-session";
import {
  handoffDetail,
  handoffScope,
  handoffTask,
  pendingDetail,
  pendingTask,
} from "./employee-handoff-flow-test-fixture";
import { ids } from "./employee-operational-test-fixture";
import {
  journeyServer,
  restoreColdStartAuthority,
  type JourneyAuthority,
} from "./employee-process-death-journey-test-fixture";
import {
  handoffVerifiedAt,
  processDeathHandoffTransport,
} from "./employee-process-death-handoff-test-fixture";
import type { ProtectedCommandServer } from "./protected-command-process-death-test-fixture";
import { processDeathCommandCut } from "./protected-command-process-death-test-fixture";

async function openProcessB(
  server: ProtectedCommandServer<JourneyAuthority>,
  generation: number,
) {
  const authority = await restoreColdStartAuthority(server, generation);
  const task = authority.tasks[0];
  if (task === undefined) throw new Error("Expected current Retrieval Task.");
  const owner = new EmployeeHandoffSession({
    transport: processDeathHandoffTransport(server),
  });
  await owner.openTask(
    generation,
    authority.scope,
    task.taskId,
    task.sessionId,
  );
  return { authority, owner };
}

describe("MOB-023B Handoff process death through production owners", () => {
  it("initiates in Process A and Process B discovers HANDOFF_PENDING", async () => {
    const server = journeyServer(handoffDetail(), handoffTask());
    const cut = processDeathCommandCut();
    let processA: EmployeeHandoffSession | undefined =
      new EmployeeHandoffSession({
        transport: processDeathHandoffTransport(
          server,
          "initiate",
          "commit-response-lost",
          undefined,
          cut,
        ),
      });
    await processA.openTask(1, handoffScope, ids.task, ids.session);
    void processA.initiate();
    await cut.reached;

    processA = undefined;
    const { authority, owner: processB } = await openProcessB(server, 2);
    expect(processB.current().phase).toBe("pending");
    expect(server.posts).toEqual(["initiate-handoff"]);
    authority.operations.dispose();
  });

  it("loses pickup proof with Process A and adopts only server verification", async () => {
    const proofCanary = "4815";
    const server = journeyServer(pendingDetail(), pendingTask());
    const cut = processDeathCommandCut();
    let processA: EmployeeHandoffSession | undefined =
      new EmployeeHandoffSession({
        transport: processDeathHandoffTransport(
          server,
          "pickup",
          "commit-response-lost",
          proofCanary,
          cut,
        ),
      });
    await processA.openTask(1, handoffScope, ids.task, ids.session);
    void processA.verifyPickupCode(proofCanary);
    await cut.reached;

    processA = undefined;
    const { authority, owner: processB } = await openProcessB(server, 2);
    expect(processB.current().phase).toBe("verified");
    expect(JSON.stringify(processB.current())).not.toContain(proofCanary);
    expect(JSON.stringify(server.canonicalRead("durable-state"))).not.toContain(
      proofCanary,
    );
    expect(server.posts).toEqual(["verify-pickup-code"]);
    authority.operations.dispose();
  });

  it("aborts in Process A and Process B discovers READY", async () => {
    const verified = pendingDetail();
    verified.version = 9;
    verified.handoff.verification = {
      method: "PICKUP_CODE",
      status: "VERIFIED",
      verifiedAt: handoffVerifiedAt,
    };
    const server = journeyServer(
      verified,
      handoffTask({
        valetSessionState: "HANDOFF_PENDING",
        valetSessionVersion: 9,
      }),
    );
    const cut = processDeathCommandCut();
    let processA: EmployeeHandoffSession | undefined =
      new EmployeeHandoffSession({
        transport: processDeathHandoffTransport(
          server,
          "abort",
          "commit-response-lost",
          undefined,
          cut,
        ),
      });
    await processA.openTask(1, handoffScope, ids.task, ids.session);
    void processA.abort("guest changed plans");
    await cut.reached;

    processA = undefined;
    const { authority, owner: processB } = await openProcessB(server, 2);
    expect(processB.current()).toMatchObject({
      phase: "ready",
      session: { handoff: { pendingAt: null, verification: null } },
    });
    expect(server.posts).toEqual(["abort-handoff"]);
    authority.operations.dispose();
  });

  it("does not replay a supervisor override after Process A dies", async () => {
    const supervisor = { ...handoffScope, role: "VALET_SUPERVISOR" as const };
    const server = journeyServer(
      pendingDetail(),
      handoffTask({
        currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
        valetSessionState: "HANDOFF_PENDING",
        valetSessionVersion: 8,
      }),
    );
    server.commitExternal((state) => {
      state.context.contexts[0]!.role = "VALET_SUPERVISOR";
    });
    const cut = processDeathCommandCut();
    let processA: EmployeeHandoffSession | undefined =
      new EmployeeHandoffSession({
        transport: processDeathHandoffTransport(
          server,
          "override",
          "commit-response-lost",
          undefined,
          cut,
        ),
      });
    await processA.openTask(1, supervisor, ids.task, ids.session);
    void processA.override("identity confirmed in person");
    await cut.reached;

    processA = undefined;
    const { authority, owner: processB } = await openProcessB(server, 2);
    expect(authority.scope.role).toBe("VALET_SUPERVISOR");
    expect(processB.current()).toMatchObject({
      phase: "verified",
      session: {
        handoff: {
          verification: {
            method: "SUPERVISOR_OVERRIDE",
            status: "VERIFIED",
          },
        },
      },
    });
    expect(server.posts).toEqual(["supervisor-override"]);
    authority.operations.dispose();
  });
});
