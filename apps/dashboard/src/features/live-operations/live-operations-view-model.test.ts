import { describe, expect, it } from "vitest";

import {
  liveOperationsAr,
  liveOperationsEn,
} from "../../i18n/translations/sections/live-operations-strings";import type { LiveOperationsItem } from "./live-operations-api";
import {
  areaLabelText,
  countLiveOperations,
  formatTimeOfDay,
  positionedItems,
  toMarkerDrafts,
  vehicleDisplayName,
} from "./live-operations-view-model";

function vehicle(
  overrides: Partial<LiveOperationsItem["vehicle"]> = {},
): LiveOperationsItem["vehicle"] {
  return {
    color: null,
    make: null,
    model: null,
    plateCountry: null,
    plateNumber: null,
    temporaryDescriptor: null,
    vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b102",
    ...overrides,
  };
}

function item(overrides: Partial<LiveOperationsItem> = {}): LiveOperationsItem {
  return {
    assigneeMembershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
    position: {
      areas: [],
      capturedAt: "2026-08-24T20:21:42+03:00",
      freshness: "LIVE",
      latitude: 32.562703,
      longitude: 35.880055,
    },
    sessionState: "PARKING",
    taskId: "59220eb7-d188-4c7f-ab9e-a4779a6af101",
    taskType: "PARKING",
    trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a101",
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b102",
    vehicle: vehicle(),
    ...overrides,
  };
}

describe("live operations counts", () => {
  it("separates tracked tasks from positioned/live/stale facts", () => {
    const counts = countLiveOperations([
      item({ trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a101" }),
      item({
        trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a102",
        position: {
          areas: [],
          capturedAt: "2026-08-24T20:19:54+03:00",
          freshness: "STALE",
          latitude: 31.95402,
          longitude: 35.91089,
        },
      }),
      item({
        trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a103",
        position: null,
      }),
    ]);
    expect(counts).toEqual({
      trackedTasks: 3,
      positionedCount: 2,
      liveCount: 1,
      staleCount: 1,
    });
  });

  it("reports zero across all facts for empty live operations", () => {
    expect(countLiveOperations([])).toEqual({
      trackedTasks: 0,
      positionedCount: 0,
      liveCount: 0,
      staleCount: 0,
    });
  });

  it("keeps unpositioned items in the operational list", () => {
    const rows = [
      item(),
      item({ trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a102", position: null }),
    ];
    expect(positionedItems(rows)).toHaveLength(1);
    expect(positionedItems(rows)[0]?.position).not.toBeNull();
  });
});

describe("vehicle display name", () => {
  const FALLBACK = "Vehicle";

  it("prefers the plate number with its country", () => {
    expect(
      vehicleDisplayName(vehicle({ plateNumber: "34-B-7890", plateCountry: "JO" }), FALLBACK),
    ).toBe("34-B-7890 · JO");
  });

  it("renders a plate without an invented country", () => {
    expect(vehicleDisplayName(vehicle({ plateNumber: "AB-1234" }), FALLBACK)).toBe(
      "AB-1234",
    );
  });

  it("falls back to the temporary descriptor, then make/model, then neutral label", () => {
    expect(vehicleDisplayName(vehicle({ temporaryDescriptor: "Blue SUV" }), FALLBACK)).toBe(
      "Blue SUV",
    );
    expect(
      vehicleDisplayName(vehicle({ make: "Toyota", model: "Land Cruiser" }), FALLBACK),
    ).toBe("Toyota Land Cruiser");
    expect(vehicleDisplayName(vehicle({ make: "Toyota" }), FALLBACK)).toBe("Toyota");
    expect(vehicleDisplayName(vehicle(), FALLBACK)).toBe(FALLBACK);
  });
});

describe("area labels", () => {
  it("joins backend-provided labels only", () => {
    const position = item().position!;
    expect(
      areaLabelText({
        ...position,
        areas: [
          { code: "PARK_A", label: "Parking Area A", levelLabel: "B1", mapAreaId: "1ab9a51b-221c-4620-9ce8-29e7ee91a101", parkingZoneId: null, purpose: "PARKING" },
          { code: "OVF_1", label: "Overflow 1", levelLabel: null, mapAreaId: "1ab9a51b-221c-4620-9ce8-29e7ee91a102", parkingZoneId: null, purpose: "OVERFLOW" },
        ],
      }),
    ).toBe("Parking Area A, Overflow 1");
  });

  it("returns null for absent areas instead of fabricating zone names", () => {
    expect(areaLabelText(item().position!)).toBeNull();
  });
});

describe("marker drafts", () => {
  it("never creates a draft for an item whose backend position is null", () => {
    const drafts = toMarkerDrafts(
      [
        item(),
        item({ trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a102", position: null }),
        item({
          trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a103",
          taskType: "RETRIEVAL",
          position: {
            areas: [],
            capturedAt: "2026-08-24T20:19:54+03:00",
            freshness: "STALE",
            latitude: -12.345678,
            longitude: 98.765432,
          },
        }),
      ],
      null,
    );
    expect(drafts.map((draft) => draft.id)).toEqual([
      "84e8d092-72d9-4a70-bd41-b24f49d1a101",
      "84e8d092-72d9-4a70-bd41-b24f49d1a103",
    ]);
  });

  it("maps task type to glyphs and freshness to tones with unchanged coordinates", () => {
    const [parking, retrieval] = toMarkerDrafts(
      [
        item(),
        item({
          trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a103",
          taskType: "RETRIEVAL",
          position: {
            areas: [],
            capturedAt: "2026-08-24T20:19:54+03:00",
            freshness: "STALE",
            latitude: -12.345678901,
            longitude: 98.765432109,
          },
        }),
      ],
      "84e8d092-72d9-4a70-bd41-b24f49d1a103",
    );
    expect(parking?.glyph).toBe("P");
    expect(parking?.tone).toBe("positive");
    expect(parking?.selected).toBe(false);
    expect(parking?.latitude).toBe(32.562703);
    expect(parking?.longitude).toBe(35.880055);
    expect(retrieval?.glyph).toBe("R");
    expect(retrieval?.tone).toBe("warning");
    // Coordinates pass through bit-for-bit; selection flags the exact id.
    expect(retrieval?.latitude).toBe(-12.345678901);
    expect(retrieval?.longitude).toBe(98.765432109);
    expect(retrieval?.selected).toBe(true);
  });
});

describe("time-of-day rendering", () => {
  it("renders valid timestamps and an em dash for invalid input", () => {
    const rendered = formatTimeOfDay("2026-08-24T20:21:42+03:00", "en");
    expect(rendered).not.toBe("—");
    expect(rendered).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(formatTimeOfDay("not-a-date", "en")).toBe("—");
  });
});

describe("loaded-scope KPI wording guard (cursor-paginated endpoint)", () => {
  // The live operations endpoint returns no location-wide totalCount: KPI
  // labels must be interpretable ONLY as facts about the currently loaded
  // rows, in both locales. These assertions fail if the copy drifts back to
  // total-sounding labels.
  it("labels KPI tiles as loaded/current-listing scope in EN and AR", () => {
    for (const key of [
      "liveOperations.kpi.trackedTasks",
      "liveOperations.kpi.positionedVehicles",
      "liveOperations.kpi.livePositions",
      "liveOperations.kpi.stalePositions",
    ] as const) {
      expect(liveOperationsEn[key]).toMatch(/loaded|listed/i);
      expect(liveOperationsAr[key]).toMatch(/المُحمَّل/);
    }
    // No KPI label may read like a bare authoritative total.
    expect(liveOperationsEn["liveOperations.kpi.trackedTasks"]).not.toBe(
      "Tracked tasks",
    );
    expect(liveOperationsAr["liveOperations.kpi.trackedTasks"]).not.toBe(
      "المهام المتتبعة",
    );
  });

  it("keeps the observedAt label truthful about per-request reads", () => {
    // The backend stamps each request freshly; pagination freezes no
    // snapshot. The label must not imply one atomic snapshot time.
    expect(liveOperationsEn["liveOperations.observedAt"]).toMatch(
      /latest server read/i,
    );
    expect(liveOperationsAr["liveOperations.observedAt"]).toMatch(/أحدث قراءة/);
  });
});
