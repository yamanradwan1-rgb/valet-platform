import type {
  AcceptTaskResponse,
  AssignTaskResponse,
  StaffOperationalContextResponse,
  StaffTaskQueueItem,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { EmployeeOperationalSession } from "./employee-operational-session";
import { EmployeeShiftEndSession } from "./employee-shift-end-session";
import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  acceptedProjection,
  ids,
  operationalContext,
  parkingTask,
} from "./employee-operational-test-fixture";
import { endedShift, shiftEndContext } from "./employee-shift-end-test-fixture";
import {
  activeShiftResponse,
  shiftStartContext,
  shiftStartIds,
} from "./employee-shift-start-test-fixture";
import {
  faultCommitted,
  ProtectedCommandServer,
  requiredProcessDeathFaults,
  type ProtectedCommandFault,
} from "./protected-command-process-death-test-fixture";

function label(fault: ProtectedCommandFault) {
  return typeof fault === "string"
    ? fault
    : `disconnect-${fault.commit ? "committed" : "not-committed"}`;
}

describe("MOB-023B Shift process death", () => {
  it.each(requiredProcessDeathFaults)(
    "restores Shift Start authority after %s without replay",
    async (fault) => {
      const server = new ProtectedCommandServer({ active: false });
      let processA: EmployeeShiftStartSession | undefined =
        new EmployeeShiftStartSession({
          refreshOperationalContext: async () => undefined,
          transport: {
            startShift: () =>
              server.mutate("start-shift", fault, (state) => {
                state.active = true;
                return activeShiftResponse();
              }),
          },
        });
      processA.activate(1);
      processA.observeOperationalContext(1, shiftStartContext());
      await processA.start();

      processA = undefined;
      const processB = new EmployeeShiftStartSession({
        refreshOperationalContext: async () => undefined,
        transport: { startShift: () => Promise.reject(new Error("replay")) },
      });
      processB.activate(2);
      const canonical = server.canonicalRead("operational-context");
      processB.observeOperationalContext(
        2,
        shiftStartContext({
          activeLocationId: canonical.active ? shiftStartIds.locationA : null,
        }),
      );

      expect(processB.current().phase, label(fault)).toBe(
        faultCommitted(fault) ? "active" : "ready",
      );
      expect(server.posts).toEqual(["start-shift"]);
    },
  );

  it.each(requiredProcessDeathFaults)(
    "restores Shift End authority after %s without replay",
    async (fault) => {
      const server = new ProtectedCommandServer({ active: true });
      let processA: EmployeeShiftEndSession | undefined =
        new EmployeeShiftEndSession({
          transport: {
            endShift: () =>
              server.mutate("end-shift", fault, (state) => {
                state.active = false;
                return endedShift();
              }),
          },
        });
      processA.activate(1);
      processA.observeOperationalContext(1, shiftEndContext());
      processA.setCashInput("10.000");
      processA.requestConfirmation();
      await processA.endShift();

      processA = undefined;
      const processB = new EmployeeShiftEndSession({
        transport: { endShift: () => Promise.reject(new Error("replay")) },
      });
      processB.activate(2);
      const canonical = server.canonicalRead("operational-context");
      processB.observeOperationalContext(
        2,
        canonical.active
          ? shiftEndContext()
          : shiftStartContext({ locations: [] }),
      );

      expect(processB.current().phase, label(fault)).toBe(
        faultCommitted(fault) ? "inactive" : "active",
      );
      expect(processB.current().cashInput).toBe("");
      expect(server.posts).toEqual(["end-shift"]);
    },
  );
});

interface TaskAuthority {
  context: StaffOperationalContextResponse;
  task: StaffTaskQueueItem;
}

function taskProcess(server: ProtectedCommandServer<TaskAuthority>) {
  return new EmployeeOperationalSession({
    pollingIntervalMs: 60_000,
    transport: {
      acceptTask: (): Promise<AcceptTaskResponse> =>
        Promise.reject(new Error("Process B must not POST")),
      assignTask: (): Promise<AssignTaskResponse> =>
        Promise.reject(new Error("Process B must not POST")),
      loadOperationalContext: async () =>
        server.canonicalRead("operational-context").context,
      loadTaskQueue: async () => ({
        tasks: [server.canonicalRead("task-queue").task],
      }),
    },
  });
}

describe("MOB-023B Task process death", () => {
  it("adopts committed accept and never repeats the POST", async () => {
    const server = new ProtectedCommandServer<TaskAuthority>({
      context: operationalContext(),
      task: parkingTask(),
    });
    let processA: EmployeeOperationalSession | undefined =
      new EmployeeOperationalSession({
        pollingIntervalMs: 60_000,
        transport: {
          acceptTask: () =>
            server.mutate("accept-task", "commit-response-lost", (state) => {
              state.task = parkingTask({ status: "ACCEPTED", version: 3 });
              return acceptedProjection();
            }),
          assignTask: () => Promise.reject(new Error("unexpected assign")),
          loadOperationalContext: async () =>
            server.canonicalRead("A-context").context,
          loadTaskQueue: async () => ({
            tasks: [server.canonicalRead("A-queue").task],
          }),
        },
      });
    await processA.activate(1);
    await processA.acceptTask(ids.task);

    processA = undefined;
    const processB = taskProcess(server);
    await processB.activate(2);
    expect(processB.current().tasks[0]).toMatchObject({
      currentAssigneeMembershipId: ids.membership,
      status: "ACCEPTED",
      version: 3,
    });
    expect(server.posts).toEqual(["accept-task"]);
    processB.dispose();
  });

  it("lets reassignment and revoked scope replace dead-process authority", async () => {
    const server = new ProtectedCommandServer<TaskAuthority>({
      context: operationalContext(),
      task: parkingTask({ status: "ACCEPTED", version: 3 }),
    });
    server.commitExternal((state) => {
      state.task = parkingTask({
        currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
        status: "ASSIGNED",
        version: 4,
      });
    });
    const reassigned = taskProcess(server);
    await reassigned.activate(2);
    expect(reassigned.current().tasks[0]).toMatchObject({
      currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
      version: 4,
    });

    server.commitExternal((state) => {
      state.context = { contexts: [] };
    });
    const revoked = taskProcess(server);
    await revoked.activate(3);
    expect(revoked.current()).toMatchObject({
      phase: "access-denied",
      tasks: [],
    });
    expect(server.posts).toEqual([]);
    reassigned.dispose();
    revoked.dispose();
  });
});
