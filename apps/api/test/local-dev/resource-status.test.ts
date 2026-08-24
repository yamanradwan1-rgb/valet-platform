import { describe, expect, it } from "vitest";

import {
  assertCanonicalFreeResources,
  classifyResourceRows,
  formatOccupancyLines,
  KEY_SLOT_OCCUPANCY_SQL,
  PARKING_SPOT_OCCUPANCY_SQL,
  type ResourceOccupancyRow,
} from "../../tools/local-dev/resource-status";

function occupiedRow(
  overrides: Partial<ResourceOccupancyRow>,
): ResourceOccupancyRow {
  return {
    code: "K-01",
    location_code: "AMM-DEMO",
    slot_status: "ACTIVE",
    session_id: "00000000-0000-4000-8000-000000000080",
    session_state: "PARKED",
    plate_number_raw: "DEMO-A-101",
    temporary_descriptor: null,
    ...overrides,
  };
}

describe("resource occupancy classification", () => {
  it("classifies FREE and OCCUPIED slots deterministically", () => {
    const rows = [
      occupiedRow({ code: "K-02", session_state: "READY" }),
      occupiedRow({ code: "K-03", session_id: null, session_state: null }),
      occupiedRow({ code: "K-01" }),
    ];
    const first = classifyResourceRows(rows);
    const second = classifyResourceRows([...rows].reverse());
    expect(first).toEqual(second);
    expect(first.map((entry) => entry.code)).toEqual(["K-01", "K-02", "K-03"]);
    expect(first[2]?.occupancy).toBe("FREE");
    expect(first[2]?.sessionId).toBeUndefined();
    expect(first[0]?.occupancy).toBe("OCCUPIED");
    expect(first[0]?.sessionState).toBe("PARKED");
  });

  it("prefers plate number over temporary descriptor and falls back safely", () => {
    const rows = [
      occupiedRow({ code: "K-01" }),
      occupiedRow({
        code: "K-02",
        plate_number_raw: null,
        temporary_descriptor: "Unreadable plate — silver demo SUV",
        session_state: "READY",
      }),
      occupiedRow({
        code: "K-04",
        plate_number_raw: null,
        temporary_descriptor: null,
      }),
    ];
    const classified = classifyResourceRows(rows);
    expect(classified[0]?.vehicleDescriptor).toBe("DEMO-A-101");
    expect(classified[1]?.vehicleDescriptor).toBe(
      "Unreadable plate — silver demo SUV",
    );
    expect(classified[2]?.vehicleDescriptor).toBe("(vehicle undescribed)");
  });

  it("marks inactive slots in formatted output", () => {
    const lines = formatOccupancyLines(
      classifyResourceRows([
        occupiedRow({
          code: "K-05",
          slot_status: "INACTIVE",
          session_id: null,
        }),
        occupiedRow({ code: "K-01" }),
      ]),
    );
    expect(lines).toEqual([
      "K-01 | OCCUPIED | PARKED | DEMO-A-101 | session 00000000-0000-4000-8000-000000000080",
      "K-05 | FREE | slot INACTIVE",
    ]);
  });

  it("enforces canonical free resources after bootstrap classification", () => {
    const classifications = classifyResourceRows([
      occupiedRow({ code: "K-03", session_id: null, session_state: null }),
      occupiedRow({ code: "K-04", session_id: null, session_state: null }),
    ]);
    expect(() =>
      assertCanonicalFreeResources(classifications, ["K-03", "K-04"]),
    ).not.toThrow();

    const blocked = classifyResourceRows([
      occupiedRow({ code: "K-03" }),
      occupiedRow({ code: "K-04", session_id: null, session_state: null }),
    ]);
    expect(() =>
      assertCanonicalFreeResources(blocked, ["K-03", "K-04"]),
    ).toThrow("must be FREE after bootstrap");

    const missing = classifyResourceRows([]);
    expect(() => assertCanonicalFreeResources(missing, ["K-03"])).toThrow(
      "missing from the seeded local database",
    );
  });

  it("keeps occupancy SQL strictly read-only", () => {
    for (const statement of [
      KEY_SLOT_OCCUPANCY_SQL,
      PARKING_SPOT_OCCUPANCY_SQL,
    ]) {
      expect(statement.trim().toUpperCase()).toMatch(/^SELECT\b/);
      expect(statement.toUpperCase()).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE)\b/,
      );
    }
  });
});
