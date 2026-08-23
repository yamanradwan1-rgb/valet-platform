import type { StaffTaskQueueItem } from "@valet/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import * as parkingRunner from "../../features/parking/parking-task-runner";
import * as taskCards from "./task-queue-cards";
import { TaskQueueScreen } from "./task-queue-screen";

describe("TaskQueueScreen concurrent actions", () => {
  it("synchronously locks TaskQueueScreen against double-submit on rapid concurrent action invocations", async () => {
    let resolveFirstRunner!: (val: {
      kind: "START_PARKING_SUCCESS";
      payload: {
        keySlotCode: null;
        locationId: string;
        parkingStartedAt: string;
        sessionId: string;
        sessionVersion: number;
        taskId: string;
        taskVersion: number;
        vehicle: {
          color: string;
          make: string;
          model: string;
          plateCountry: string;
          plateNumberRaw: string;
          temporaryDescriptor: null;
        };
      };
    }) => void;
    const pendingPromise = new Promise<{
      kind: "START_PARKING_SUCCESS";
      payload: {
        keySlotCode: null;
        locationId: string;
        parkingStartedAt: string;
        sessionId: string;
        sessionVersion: number;
        taskId: string;
        taskVersion: number;
        vehicle: {
          color: string;
          make: string;
          model: string;
          plateCountry: string;
          plateNumberRaw: string;
          temporaryDescriptor: null;
        };
      };
    }>((res) => {
      resolveFirstRunner = res;
    });

    const runnerSpy = vi
      .spyOn(parkingRunner, "executeParkingTaskAction")
      .mockReturnValue(pendingPromise);

    let capturedAction: (() => void) | null = null;
    const cardSpy = vi
      .spyOn(taskCards, "LivePriorityTaskCard")
      .mockImplementation((props) => {
        capturedAction = props.onAction;
        return <div id="mock-priority-card">Mock Card</div>;
      });

    const parkingTask: StaffTaskQueueItem = {
      taskId: "99999999-9999-4999-8999-999999999999",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "88888888-8888-4888-8888-888888888888",
      taskType: "PARKING",
      status: "QUEUED",
      currentAssigneeMembershipId: null,
      version: 1,
      createdAt: "2026-08-21T18:00:00.000Z",
      parkingZone: "Zone A",
      parkingSpot: null,
      retrievalRequestedAt: null,
      vehicle: {
        make: "Toyota",
        model: "Camry",
        color: "Silver",
        plateNumberRaw: "87-65432",
        temporaryDescriptor: null,
      },
    };

    renderToStaticMarkup(
      <TaskQueueScreen
        mode="live"
        locationId="loc-1"
        initialTasks={[parkingTask]}
      />,
    );

    expect(capturedAction).not.toBeNull();

    // Trigger double-click rapidly while the first mutation promise is held pending
    capturedAction!();
    capturedAction!();

    // Invariant: executeParkingTaskAction is executed exactly once
    expect(runnerSpy).toHaveBeenCalledTimes(1);

    // Resolve the pending promise to clean up
    resolveFirstRunner({
      kind: "START_PARKING_SUCCESS",
      payload: {
        keySlotCode: null,
        locationId: "loc-1",
        parkingStartedAt: "2026-08-21T18:05:00.000Z",
        sessionId: "88888888-8888-4888-8888-888888888888",
        sessionVersion: 2,
        taskId: "99999999-9999-4999-8999-999999999999",
        taskVersion: 2,
        vehicle: {
          color: "Silver",
          make: "Toyota",
          model: "Camry",
          plateCountry: "JO",
          plateNumberRaw: "87-65432",
          temporaryDescriptor: null,
        },
      },
    });
    await pendingPromise;

    runnerSpy.mockRestore();
    cardSpy.mockRestore();
  });
});
