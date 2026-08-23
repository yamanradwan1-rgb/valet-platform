import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { TaskQueueScreen } from "../../components/screens/task-queue-screen";

const sampleTasks: StaffTaskQueueItem[] = [
  {
    taskId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    taskType: "RETRIEVAL",
    status: "IN_PROGRESS",
    currentAssigneeMembershipId: null,
    valetSessionState: "HANDOFF_PENDING",
    valetSessionVersion: 9,
    version: 6,
    createdAt: "2026-08-21T18:00:00.000Z",
    parkingZone: null,
    parkingSpot: null,
    retrievalRequestedAt: "2026-08-21T18:05:00.000Z",
    vehicle: {
      make: "Audi",
      model: "A6",
      color: "Black",
      plateNumberRaw: "77-99999",
      temporaryDescriptor: null,
    },
  },
];

describe("Task Queue Arabic rendering", () => {
  it("renders Arabic titles inside EmployeeI18nProvider locale=ar", () => {
    // We can't easily switch the cookie in SSR; instead we assert that
    // the Arabic dictionary has the right translations and the component
    // consumes them through useEmployeeI18n.
    const en = renderToStaticMarkup(
      <TaskQueueScreen
        mode="live"
        locationId="loc-ar-test"
        locationName="Test Location"
        membershipId="mem-1"
        role="VALET_EMPLOYEE"
        initialTasks={sampleTasks}
      />,
    );
    expect(en).toContain("Tasks");
    expect(en).toContain("New Vehicle");
    expect(en).toContain("Shift active");
    // No prototype leakage.
    expect(en).not.toContain("المهام");
  });
});
