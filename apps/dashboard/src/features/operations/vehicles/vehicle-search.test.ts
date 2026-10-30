import type { SessionOverviewEntry } from "@valet/contracts";
import { describe, expect, it } from "vitest";
import { matchesLoadedVehicleQuery } from "./vehicle-search";

const session: SessionOverviewEntry = {
  sessionId: "77777777-7777-4777-8777-777777777701",
  state: "PARKED",
  createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  keySlotId: null,
  parkingSpotId: null,
  currentAssigneeMembershipId: null,
  activeTask: null,
  keySlot: null,
  parkingSpot: null,
  parkingZone: null,
  vehicle: {
    vehicleId: "77777777-7777-4777-8777-777777777702",
    make: "Toyota",
    model: "Camry",
    color: "Gold",
    plateCountry: "JO",
    plateNumberNormalized: "12-34567",
    temporaryDescriptor: "Blue SUV near gate",
  },
};

describe("Vehicles loaded-page search", () => {
  it("finds make/model, plate and descriptor independently", () => {
    for (const query of [
      "Toyota Camry",
      "camry",
      "12-34567",
      "BLUE SUV",
      "near gate",
    ]) {
      expect(matchesLoadedVehicleQuery(session, query), query).toBe(true);
    }
    expect(matchesLoadedVehicleQuery(session, "Ford")).toBe(false);
  });

  it("matches the Arabic descriptor when make/model is present", () => {
    const arabic: SessionOverviewEntry = {
      ...session,
      vehicle: {
        ...session.vehicle,
        temporaryDescriptor: "سيارة زرقاء بجانب البوابة",
      },
    };
    expect(matchesLoadedVehicleQuery(arabic, " سيارة زرقاء ")).toBe(true);
    expect(matchesLoadedVehicleQuery(arabic, "البوابة")).toBe(true);
    expect(matchesLoadedVehicleQuery(arabic, "سيارة حمراء")).toBe(false);
  });

  it("trims search/fields, folds English case and keeps blank query unfiltered", () => {
    const padded: SessionOverviewEntry = {
      ...session,
      vehicle: {
        ...session.vehicle,
        make: "  TOYOTA ",
        model: " Camry  ",
        plateNumberNormalized: " 12-34567 ",
        temporaryDescriptor: "  Blue SUV  ",
      },
    };
    for (const query of [" toyota camry ", " 12-34567 ", " blue suv "]) {
      expect(matchesLoadedVehicleQuery(padded, query), query).toBe(true);
    }
    expect(matchesLoadedVehicleQuery(padded, "  ")).toBe(true);
  });

  it("handles absent or whitespace-only identity without UUID or unrelated fields", () => {
    const empty: SessionOverviewEntry = {
      ...session,
      vehicle: {
        ...session.vehicle,
        make: null,
        model: "  ",
        plateNumberNormalized: null,
        temporaryDescriptor: " ",
      },
    };
    expect(matchesLoadedVehicleQuery(empty, "  ")).toBe(true);
    expect(matchesLoadedVehicleQuery(empty, "toyota")).toBe(false);
    expect(matchesLoadedVehicleQuery(empty, "77777777")).toBe(false);
    expect(matchesLoadedVehicleQuery(session, "Gold")).toBe(false);
    expect(matchesLoadedVehicleQuery(session, "JO")).toBe(false);
  });

  it("does not match fields from another loaded row", () => {
    const another: SessionOverviewEntry = {
      ...session,
      sessionId: "77777777-7777-4777-8777-777777777703",
      state: "READY",
      vehicle: {
        ...session.vehicle,
        vehicleId: "77777777-7777-4777-8777-777777777704",
        make: "Nissan",
        model: "Sunny",
        plateNumberNormalized: "44-99881",
        temporaryDescriptor: null,
      },
    };
    const loaded = [session, another];
    expect(
      loaded.filter((item) => matchesLoadedVehicleQuery(item, "12-34567")),
    ).toEqual([session]);
    expect(
      loaded.filter(
        (item) =>
          item.state === "READY" && matchesLoadedVehicleQuery(item, "12-34567"),
      ),
    ).toEqual([]);
  });
});
