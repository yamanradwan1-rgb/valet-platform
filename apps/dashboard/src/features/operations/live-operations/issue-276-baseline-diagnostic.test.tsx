import type {
  ManagementLocation,
  SessionOverviewEntry,
} from "@valet/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveOperationsTable } from "./live-operations-table";

// Diagnostic only: intentionally asserts the pre-U003/current-main deficiency.
// After U003 acceptance, replace with authorized history DTO and mounted tests.
const location = {
  name: "Synthetic Location",
  code: "SYN",
  timezone: "Asia/Amman",
} as ManagementLocation;

const baseline: SessionOverviewEntry = {
  sessionId: "77777777-7777-4777-8777-777777777701",
  state: "PARKED",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  keySlotId: null,
  parkingSpotId: null,
  currentAssigneeMembershipId: null,
  activeTask: null,
  keySlot: null,
  parkingSpot: null,
  parkingZone: null,
  vehicle: {
    vehicleId: "77777777-7777-4777-8777-777777777702",
    make: "Synthetic",
    model: "A",
    color: null,
    plateCountry: null,
    plateNumberNormalized: null,
    temporaryDescriptor: "Synthetic parked A",
  },
};

function render(items: SessionOverviewEntry[], locale: "en" | "ar" = "en") {
  return renderToStaticMarkup(
    createElement(LiveOperationsTable, {
      canNext: false,
      canPrevious: false,
      error: null,
      items,
      loading: false,
      locale,
      location,
      onNext: () => {},
      onPrevious: () => {},
      onRetry: () => {},
    }),
  );
}

describe("Issue #276 pre-approval synthetic baseline", () => {
  it("reproduces two PARKED/no-active-task rows as Unassigned, not Parked By", () => {
    // Separate synthetic persisted history is deliberately NOT part of
    // SessionOverviewEntry. This reproduces the exact projection boundary:
    // the historical Parking tasks exist but the public page cannot show them.
    const second: SessionOverviewEntry = {
      ...baseline,
      sessionId: "77777777-7777-4777-8777-777777777703",
      vehicle: {
        ...baseline.vehicle,
        vehicleId: "77777777-7777-4777-8777-777777777704",
        model: "B",
        temporaryDescriptor: "Synthetic parked B",
      },
    };
    const storedHistory = [
      {
        sessionId: baseline.sessionId,
        checkedInByMembershipId: "77777777-7777-4777-8777-777777777708",
        parkingTask: {
          type: "PARKING",
          status: "COMPLETED",
          assigneeMembershipId: "77777777-7777-4777-8777-777777777709",
        },
      },
      {
        sessionId: second.sessionId,
        checkedInByMembershipId: "77777777-7777-4777-8777-777777777710",
        parkingTask: {
          type: "PARKING",
          status: "COMPLETED",
          assigneeMembershipId: "77777777-7777-4777-8777-777777777710",
        },
      },
    ] as const;
    expect(storedHistory.map((row) => row.parkingTask.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
    ]);
    expect(storedHistory[0].parkingTask.assigneeMembershipId).not.toBe(
      storedHistory[0].checkedInByMembershipId,
    );
    expect(storedHistory[1].parkingTask.assigneeMembershipId).toBe(
      storedHistory[1].checkedInByMembershipId,
    );
    const html = render([baseline, second]);
    expect(html.match(/Unassigned/g)).toHaveLength(2);
    expect(html).toContain("Synthetic A");
    expect(html).toContain("Synthetic B");
    expect(html).not.toContain("Parked by");
  });

  it("keeps queued Retrieval unassigned without borrowing history", () => {
    const queued: SessionOverviewEntry = {
      ...baseline,
      state: "REQUESTED",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777705",
        assignee: null,
      },
    };
    expect(render([queued])).toContain("Unassigned");
    expect(render([queued], "ar")).toContain("غير مسندة");
  });

  it("renders only the actual current active Retrieval assignee", () => {
    const assigned: SessionOverviewEntry = {
      ...baseline,
      state: "RETRIEVING",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777706",
        assignee: {
          membershipId: "77777777-7777-4777-8777-777777777707",
          identity: {
            firstName: "Nora",
            lastName: "Synthetic",
            email: "nora@example.test",
          },
        },
      },
    };
    const html = render([assigned]);
    expect(html).toContain("Nora Synthetic");
    expect(html).not.toContain("Parked by");
  });
});
