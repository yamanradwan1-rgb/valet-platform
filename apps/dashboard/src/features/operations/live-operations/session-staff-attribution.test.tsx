import type {
  LiveSessionOverviewEntry,
  ManagementLocation,
  SessionOverviewEntry,
} from "@valet/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardLocaleProvider } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { LiveOperationsTable } from "./live-operations-table";
import { SessionDrawer } from "./session-drawer";
import { liveStaffCell } from "./session-staff-attribution";

const location = {
  name: "Synthetic Garage",
  code: "SYN",
  timezone: "Asia/Amman",
} as ManagementLocation;
const base: LiveSessionOverviewEntry = {
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
    model: "Vehicle",
    color: null,
    plateCountry: null,
    plateNumberNormalized: null,
    temporaryDescriptor: "Synthetic parked vehicle",
  },
  checkedInBy: { firstName: "Carmen", lastName: "Original" },
  parkedBy: { firstName: "Nora", lastName: "Parker" },
  parkingCompletionProof: "PROVEN",
};

function table(item: LiveSessionOverviewEntry, locale: "en" | "ar") {
  return renderToStaticMarkup(
    createElement(LiveOperationsTable, {
      canNext: false,
      canPrevious: false,
      error: null,
      items: [item],
      loading: false,
      locale,
      location,
      onNext: () => {},
      onPrevious: () => {},
      onRetry: () => {},
    }),
  );
}

function drawer(
  item: SessionOverviewEntry,
  history: LiveSessionOverviewEntry | undefined,
) {
  return renderToStaticMarkup(
    createElement(
      DashboardLocaleProvider,
      null,
      createElement(SessionDrawer, {
        ...(history === undefined ? {} : { history }),
        item,
        locale: "en",
        location,
        onClose: () => {},
      }),
    ),
  );
}

describe("#276 Live-only historical staff attribution", () => {
  it("uses proven original Parker only for PARKED without an active Task", () => {
    expect(liveStaffCell(base, "en")).toEqual({
      primary: "Nora Parker",
      secondary: "Parked by",
      source: "PARKING_HISTORY",
    });
    expect(liveStaffCell(base, "ar").secondary).toBe(
      operationsCopy("ar").liveParkedBy,
    );
    const html = table(base, "en");
    expect(html).toContain("Nora Parker");
    expect(html).toContain("Parked by");
    expect(html).not.toContain("Carmen Original");
    expect((html.match(/<th(?:\s|>)/g) ?? []).length).toBe(6);
    expect(html).not.toContain("example.test");
  });

  it("never invents a Parker from NO_RECORD, UNVERIFIABLE or missing names", () => {
    for (const proof of ["NO_RECORD", "UNVERIFIABLE"] as const) {
      const item = { ...base, parkingCompletionProof: proof, parkedBy: null };
      expect(liveStaffCell(item, "en")).toEqual({
        primary: "Unknown",
        secondary: null,
        source: "UNKNOWN",
      });
      expect(table(item, "en")).not.toContain("Parked by");
      expect(drawer(item, item)).not.toContain("Parked by");
    }
    const provenMissingName = { ...base, parkedBy: null };
    expect(liveStaffCell(provenMissingName, "en")).toEqual({
      primary: "Unknown",
      secondary: "Parked by",
      source: "PARKING_HISTORY",
    });
    expect(liveStaffCell(provenMissingName, "ar").secondary).toBe(
      operationsCopy("ar").liveParkedBy,
    );
    expect(table(provenMissingName, "en")).toContain("Parked by");
    expect(drawer(provenMissingName, provenMissingName)).toContain(
      "Parked by",
    );
  });

  it("never borrows historical Parker for queued/unassigned Retrieval", () => {
    const queued: LiveSessionOverviewEntry = {
      ...base,
      state: "REQUESTED",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777703",
        assignee: null,
      },
    };
    expect(liveStaffCell(queued, "en").primary).toBe("Unassigned");
    expect(liveStaffCell(queued, "ar").primary).toBe("غير مسندة");
    expect(table(queued, "en")).not.toContain("Nora Parker");
  });

  it("keeps the actual active Retrieval employee instead of historic Parker", () => {
    const current: LiveSessionOverviewEntry = {
      ...base,
      state: "RETRIEVING",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777703",
        assignee: {
          membershipId: "77777777-7777-4777-8777-777777777704",
          identity: {
            firstName: "Hadi",
            lastName: "Current",
            email: "hadi@example.test",
          },
        },
      },
    };
    expect(liveStaffCell(current, "en").primary).toBe("Hadi Current");
    expect(liveStaffCell(current, "en").secondary).toBe("Assigned to");
    const html = table(current, "en");
    expect(html).not.toContain("Nora Parker");
    expect(html).not.toContain("hadi@example.test");
    const details = drawer(current, current);
    expect(details).toContain("hadi@example.test");
    expect(details).toContain("Nora Parker");
  });

  it("isolates historical facts from the shared Vehicles drawer", () => {
    const shared: SessionOverviewEntry = base;
    const vehicles = drawer(shared, undefined);
    const live = drawer(shared, base);
    expect(vehicles).not.toContain("Original check-in staff");
    expect(vehicles).not.toContain("Carmen Original");
    expect(vehicles).not.toContain("Nora Parker");
    expect(live).toContain("Original check-in staff");
    expect(live).toContain("Carmen Original");
    expect(live).toContain("Nora Parker");
    expect(live).not.toContain("example.test");
  });
});
