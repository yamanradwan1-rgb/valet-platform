import { describe, expect, it } from "vitest";

import {
  demoSessions,
  matchDemoSessions,
} from "./investigation-demo-fixtures";
import { DEFAULT_INVESTIGATION_QUERY } from "./investigation-demo-types";

describe("Issue #300 fictional investigation evidence", () => {
  it("discovers all three Sessions through in-window historical K-07 records", () => {
    const matches = matchDemoSessions(DEFAULT_INVESTIGATION_QUERY);

    expect(matches.map(({ session, witnessIds, count, first, last }) => ({
      id: session.id,
      witnessIds,
      count,
      first,
      last,
    }))).toEqual([
      {
        id: "VS-DEMO-1021",
        witnessIds: ["CUS-105", "CUS-106", "CUS-106B"],
        count: 3,
        first: "14:06",
        last: "14:22",
      },
      {
        id: "VS-DEMO-1022",
        witnessIds: ["CUS-202", "CUS-204", "CUS-206", "CUS-206B"],
        count: 4,
        first: "14:30",
        last: "14:50",
      },
      {
        id: "VS-DEMO-1023",
        witnessIds: ["CUS-302"],
        count: 1,
        first: "14:54",
        last: "14:54",
      },
    ]);
  });

  it("retains full before/after-window evidence and explicit reassignment clears", () => {
    expect(demoSessions.map(({ events }) => events.length)).toEqual([12, 8, 5]);
    for (const session of demoSessions) {
      expect(session.events.map(({ time }) => time)).toEqual(
        [...session.events.map(({ time }) => time)].sort(),
      );
    }
    const first = demoSessions[0]!;
    expect(first.events[0]!.time).toBe("13:36");
    expect(first.events.at(-1)!.time).toBe("15:12");
    expect(first.events.find(({ id }) => id === "AUD-109B")?.time).toBe("15:09");
    expect(first.events.find(({ id }) => id === "AUD-109")?.time).toBe("15:10");
    expect(first.events.some(({ id, type }) => id === "CUS-106B" && type === "SLOT_CLEARED")).toBe(true);
    expect(demoSessions[1]!.events.some(({ id, type }) => id === "CUS-206B" && type === "SLOT_CLEARED")).toBe(true);
  });

  it("does not represent historical slot reuse as current custody", () => {
    expect(demoSessions.map(({ state, currentSlot }) => ({ state, currentSlot }))).toEqual([
      { state: "COMPLETED", currentSlot: null },
      { state: "OPEN", currentSlot: null },
      { state: "OPEN", currentSlot: "K-07" },
    ]);
    expect(demoSessions[1]!.events.find(({ id }) => id === "AUD-207")?.actor).toBeNull();
    const report = demoSessions[2]!.events.find(({ id }) => id === "INC-304")!;
    expect(report.transition).toContain("KEY_MISSING");
    expect(report.transition).toContain("not proven");
    expect(report.evidence).toContain("unavailable or restricted");
    expect(demoSessions[2]!.events.filter(({ id }) => id.startsWith("INC-"))).toHaveLength(1);
  });

  it("requires one in-window witness per category without inventing shared responsibility", () => {
    const matches = matchDemoSessions({
      ...DEFAULT_INVESTIGATION_QUERY,
      employee: "Salma Faris",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.session.id).toBe("VS-DEMO-1023");
    expect(matches[0]!.witnessIds).toEqual(["CUS-302", "INC-304"]);
    expect(demoSessions[2]!.events.find(({ id }) => id === "CUS-302")?.actor).toBe("Hadi Mansour");
    expect(demoSessions[2]!.events.find(({ id }) => id === "INC-304")?.actor).toBe("Salma Faris");
  });

  it("respects [start, end), location, date and exact Session constraints", () => {
    expect(matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, end: "14:06" })).toHaveLength(0);
    const atBoundary = matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, start: "14:06", end: "14:07" });
    expect(atBoundary.map(({ session }) => session.id)).toEqual(["VS-DEMO-1021"]);
    expect(matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, location: "foreign" })).toEqual([]);
    expect(matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, date: "2026-10-22" })).toEqual([]);
    expect(matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, start: "15:00", end: "14:00" })).toEqual([]);
    expect(matchDemoSessions({
      ...DEFAULT_INVESTIGATION_QUERY,
      sessionId: "VS-DEMO-1022",
    }).map(({ session }) => session.id)).toEqual(["VS-DEMO-1022"]);
  });

  it("limits current vehicle matches to supported fields, including absent plates", () => {
    expect(matchDemoSessions({
      ...DEFAULT_INVESTIGATION_QUERY,
      make: "Kia",
      model: "Sportage",
    }).map(({ session }) => session.id)).toEqual(["VS-DEMO-1023"]);
    expect(matchDemoSessions({ ...DEFAULT_INVESTIGATION_QUERY, plate: "DEM-214" })
      .map(({ session }) => session.id)).toEqual(["VS-DEMO-1021"]);
    expect(matchDemoSessions({
      ...DEFAULT_INVESTIGATION_QUERY,
      make: "Kia",
      plate: "DEM-214",
    })).toEqual([]);
  });
});
