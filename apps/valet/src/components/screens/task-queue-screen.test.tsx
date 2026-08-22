import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { TaskQueueScreen } from "./task-queue-screen";
import { AppHeader } from "../shell/app-header";
import * as parkingRunner from "../../features/parking/parking-task-runner";
import * as taskCards from "./task-queue-cards";

describe("TaskQueueScreen Component", () => {
  const sampleTasks: StaffTaskQueueItem[] = [
    {
      taskId: "11111111-1111-4111-8111-111111111111",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "22222222-2222-4222-8222-222222222222",
      taskType: "RETRIEVAL",
      status: "ASSIGNED",
      currentAssigneeMembershipId: "33333333-3333-4333-8333-333333333333",
      version: 1,
      createdAt: "2026-08-21T18:00:00.000Z",
      parkingZone: "Zone B",
      parkingSpot: "Spot B-17",
      retrievalRequestedAt: "2026-08-21T18:02:00.000Z",
      vehicle: {
        make: "Porsche",
        model: "Cayenne",
        color: "Navy",
        plateNumberRaw: "55-12345",
        temporaryDescriptor: null,
      },
    },
    {
      taskId: "44444444-4444-4444-8444-444444444444",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "55555555-5555-4555-8555-555555555555",
      taskType: "PARKING",
      status: "QUEUED",
      currentAssigneeMembershipId: null,
      version: 1,
      createdAt: "2026-08-21T18:01:00.000Z",
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
    },
  ];

  it("renders live operational task queue with AGE and STATUS slots and exact visual classes", () => {
    const markup = renderToStaticMarkup(
      <TaskQueueScreen
        mode="live"
        locationId="loc-1"
        locationName="Grand Hotel Amman"
        shiftStartedAt="2026-08-21T17:30:00.000Z"
        initialTasks={sampleTasks}
      />,
    );

    // Shift header assertions
    expect(markup).toContain("Shift active");
    expect(markup).toContain("Grand Hotel Amman");

    // Priority card assertions (Approved live AGE and STATUS slots)
    expect(markup).toContain("AGE");
    expect(markup).toContain("STATUS");
    expect(markup).toContain("ASSIGNED");
    expect(markup).toContain("Porsche Cayenne");
    expect(markup).toContain("55-12345");
    expect(markup).toContain("Accept Task");

    // Visual class preservation assertions
    expect(markup).toContain(
      "cursor-pointer shadow-sm hover:shadow-md transition-shadow",
    );
    expect(markup).toContain(
      "cursor-pointer hover:bg-gray-50 transition-colors",
    );
    expect(markup).toContain("active:scale-[0.98]");

    // Live Queue list item assertions
    expect(markup).toContain("Toyota Camry");
    expect(markup).toContain("87-65432");
    expect(markup).toContain("Zone A");
  });

  it("never falls back to prototype values in live mode with missing scope fields", () => {
    const markup = renderToStaticMarkup(
      <TaskQueueScreen
        mode="live"
        locationId="loc-incomplete"
        locationName={undefined}
        shiftStartedAt={undefined}
        initialTasks={[]}
      />,
    );

    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("6:00 PM");
  });

  it("renders data-driven absence when live queue has zero tasks", () => {
    const markup = renderToStaticMarkup(
      <TaskQueueScreen
        mode="live"
        locationId="loc-1"
        locationName="Grand Hotel Amman"
        shiftStartedAt="2026-08-21T17:30:00.000Z"
        initialTasks={[]}
      />,
    );

    expect(markup).toContain("Tasks");
    expect(markup).toContain("Queue");
    expect(markup).toContain("Grand Hotel Amman");
    expect(markup).not.toContain("No active priority task");
    expect(markup).not.toContain("No tasks in queue");
    expect(markup).not.toContain("BMW X5");
  });

  it("renders prototype fallback baseline when mode is prototype", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(
      <TaskQueueScreen mode="prototype" nav={nav} />,
    );
    expect(markup).toContain("Tasks");
    expect(markup).toContain("New Vehicle");
    expect(markup).toContain("Shift active");
    expect(markup).toContain("02:14");
    expect(markup).toContain("SLA");
    expect(markup).toContain("Pickup");
  });

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

describe("AppHeader Component", () => {
  it("renders live location and role without prototype fallbacks in live mode", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        mode="live"
        locationName="Amman Rotana"
        locationCode="ROT-01"
        role="VALET_SUPERVISOR"
      />,
    );

    expect(markup).toContain("Amman Rotana");
    expect(markup).toContain("ROT-01");
    expect(markup).toContain("VS");
    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("MK");
  });

  it("never falls back to MK or Four Seasons in live mode when props are undefined", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        mode="live"
        locationName={undefined}
        locationCode={undefined}
        role={undefined}
      />,
    );

    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("MK");
  });

  it("renders prototype values in prototype mode", () => {
    const markup = renderToStaticMarkup(<AppHeader mode="prototype" />);
    expect(markup).toContain("Four Seasons Amman");
    expect(markup).toContain("Main Entrance");
    expect(markup).toContain("MK");
  });
});
