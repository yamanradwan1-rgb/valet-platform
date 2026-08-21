import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { TaskQueueScreen } from "./task-queue-screen";

describe("TaskQueueScreen Component", () => {
  const sampleTasks: StaffTaskQueueItem[] = [
    {
      taskId: "11111111-1111-4111-8111-111111111111",
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
        make: "BMW",
        model: "X5",
        color: "Black",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    },
    {
      taskId: "44444444-4444-4444-8444-444444444444",
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

  it("renders live operational task queue with AGE and STATUS slots", () => {
    const markup = renderToStaticMarkup(
      <TaskQueueScreen
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
    expect(markup).toContain("BMW X5");
    expect(markup).toContain("12-34567");
    expect(markup).toContain("Accept Task");

    // Live Queue list item assertions
    expect(markup).toContain("Toyota Camry");
    expect(markup).toContain("87-65432");
    expect(markup).toContain("Zone A");
  });

  it("renders empty state when live queue is empty", () => {
    const markup = renderToStaticMarkup(
      <TaskQueueScreen
        locationId="loc-1"
        locationName="Grand Hotel Amman"
        shiftStartedAt="2026-08-21T17:30:00.000Z"
        initialTasks={[]}
      />,
    );

    expect(markup).toContain("No active priority task");
    expect(markup).toContain("No tasks in queue");
  });

  it("renders prototype fallback baseline when no live props are provided", () => {
    const markup = renderToStaticMarkup(<TaskQueueScreen />);
    expect(markup).toContain("Tasks");
    expect(markup).toContain("New Vehicle");
    expect(markup).toContain("Shift active");
    expect(markup).toContain("02:14");
    expect(markup).toContain("SLA");
    expect(markup).toContain("Pickup");
    expect(markup).toContain("Toyota Camry");
    expect(markup).toContain("Mercedes E-Class");
    expect(markup).toContain("Audi Q7");
  });
});
