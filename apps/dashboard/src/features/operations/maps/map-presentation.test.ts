import type { LiveOperationsMapResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  liveMapItemPresentation,
  liveMapMarkerLabel,
  mapAreaDescription,
  mapCapturedTime,
  mapFreshnessLabel,
  mapVehicleDirection,
  mapVehicleLabel,
} from "./map-presentation";

type LiveItem = LiveOperationsMapResponse["items"][number];

const baseItem: LiveItem = {
  assigneeMembershipId: "55555555-5555-4555-8555-555555555501",
  position: {
    areas: [
      {
        code: "P-A",
        label: "Parking Area A",
        levelLabel: "B1",
        mapAreaId: "77777777-7777-4777-8777-777777777701",
        parkingZoneId: "77777777-7777-4777-8777-777777777702",
        purpose: "PARKING",
      },
    ],
    capturedAt: "2026-09-21T12:00:00.000Z",
    freshness: "LIVE",
    latitude: 31.9539,
    longitude: 35.9106,
  },
  sessionState: "PARKING",
  taskId: "77777777-7777-4777-8777-777777777703",
  taskType: "PARKING",
  trackingSessionId: "77777777-7777-4777-8777-777777777704",
  valetSessionId: "77777777-7777-4777-8777-777777777705",
  vehicle: {
    color: "Blue",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumber: "12-34567",
    temporaryDescriptor: "Blue sedan near gate",
    vehicleId: "77777777-7777-4777-8777-777777777706",
  },
};

function withVehicle(vehicle: Partial<LiveItem["vehicle"]>): LiveItem {
  return { ...baseItem, vehicle: { ...baseItem.vehicle, ...vehicle } };
}

describe("map presentation", () => {
  it("uses plate, descriptor, make/model, then localized unavailable without UUID fallback", () => {
    expect(mapVehicleLabel(baseItem, "en")).toBe("12-34567");
    expect(mapVehicleDirection(baseItem)).toBe("ltr");

    expect(mapVehicleLabel(withVehicle({ plateNumber: null }), "en"))
      .toBe("Blue sedan near gate");
    expect(mapVehicleDirection(withVehicle({
      plateNumber: null,
      temporaryDescriptor: "سيارة زرقاء",
    }))).toBe("auto");

    expect(mapVehicleLabel(withVehicle({
      plateNumber: null,
      temporaryDescriptor: null,
    }), "en")).toBe("Toyota Camry");

    expect(mapVehicleLabel(withVehicle({
      plateNumber: " ",
      temporaryDescriptor: " ",
      make: "Toyota",
      model: null,
    }), "en")).toBe("Toyota");

    const unavailable = withVehicle({
      plateNumber: null,
      temporaryDescriptor: null,
      make: null,
      model: null,
    });
    expect(mapVehicleLabel(unavailable, "en")).toBe("Vehicle identity unavailable");
    expect(mapVehicleLabel(unavailable, "ar")).toBe("هوية المركبة غير متاحة");
    expect(mapVehicleLabel(unavailable, "en")).not.toContain(unavailable.vehicle.vehicleId);
  });

  it("localizes task, session, and live freshness facts in English and Arabic", () => {
    const en = liveMapItemPresentation(baseItem, "en", "Asia/Amman");
    expect(en.taskType).toBe("Parking");
    expect(en.sessionState).toBe("Parking");
    expect(en.freshness).toBe("Live");

    const retrieval: LiveItem = {
      ...baseItem,
      sessionState: "RETRIEVING",
      taskType: "RETRIEVAL",
    };
    const ar = liveMapItemPresentation(retrieval, "ar", "Asia/Amman");
    expect(ar.taskType).toBe("استرجاع");
    expect(ar.sessionState).toBe("جارٍ الاسترجاع");
    expect(ar.freshness).toBe("مباشر");
  });

  it("distinguishes stale and no-position states truthfully in both locales", () => {
    const stale: LiveItem = {
      ...baseItem,
      position: { ...baseItem.position!, freshness: "STALE" },
    };
    expect(mapFreshnessLabel(stale.position, "en")).toBe("Last known");
    expect(mapFreshnessLabel(stale.position, "ar")).toBe("آخر موقع معروف");

    const noPosition: LiveItem = { ...baseItem, position: null };
    expect(mapFreshnessLabel(noPosition.position, "en")).toBe("No current position");
    expect(mapFreshnessLabel(noPosition.position, "ar")).toBe("لا يوجد موقع حالي");
    expect(liveMapItemPresentation(noPosition, "en").captured).toBeNull();
    expect(liveMapItemPresentation(noPosition, "en").areas).toEqual([]);
  });

  it("presents containing area label, code, purpose, and level without identifiers", () => {
    const area = baseItem.position!.areas[0]!;
    expect(mapAreaDescription(area, "en"))
      .toBe("Parking Area A (\u2066P-A\u2069) · Parking · B1");
    expect(mapAreaDescription(area, "ar"))
      .toBe("Parking Area A (\u2066P-A\u2069) · اصطفاف · B1");

    const en = liveMapItemPresentation(baseItem, "en");
    expect(en.areas).toEqual(["Area: Parking Area A (\u2066P-A\u2069) · Parking · B1"]);
    expect(en.areas.join(" ")).not.toContain(area.mapAreaId);
    expect(en.areas.join(" ")).not.toContain(area.parkingZoneId!);

    expect(mapAreaDescription({ ...area, purpose: "OVERFLOW" }, "en"))
      .toContain("Overflow");
    expect(mapAreaDescription({ ...area, purpose: "STAGING" }, "ar"))
      .toContain("تجهيز");
    expect(mapAreaDescription({ ...area, purpose: "RESTRICTED", levelLabel: null }, "en"))
      .toBe("Parking Area A (\u2066P-A\u2069) · Restricted");
  });

  it("formats captured time only with an authoritative timezone", () => {
    const en = mapCapturedTime(baseItem, "Asia/Amman", "en");
    expect(en).toContain("3:00");
    expect(en).not.toContain("12:00");

    const ar = mapCapturedTime(baseItem, "Asia/Amman", "ar");
    expect(ar).not.toBe(en);
    expect(ar).toMatch(/[٠-٩]/u);

    expect(mapCapturedTime(baseItem, undefined, "en")).toBe("Time unavailable");
    expect(mapCapturedTime(baseItem, "", "en")).toBe("Time unavailable");
    expect(mapCapturedTime(baseItem, undefined, "ar")).toBe("الوقت غير متاح");

    expect(liveMapItemPresentation(baseItem, "en").captured)
      .toBe("Position time: Time unavailable");
  });

  it("never emits raw UUIDs or coordinates in the manager marker label", () => {
    const item = withVehicle({
      plateNumber: null,
      temporaryDescriptor: null,
      make: null,
      model: null,
    });
    const label = liveMapMarkerLabel(item, "en");

    expect(label).toContain("Vehicle identity unavailable");
    expect(label).toContain("Parking");
    expect(label).toContain("Live");
    expect(label).toContain("Parking Area A (\u2066P-A\u2069)");
    expect(label).toContain("Time unavailable");
    expect(label).not.toContain(item.taskId);
    expect(label).not.toContain(item.vehicle.vehicleId);
    expect(label).not.toContain(item.trackingSessionId);
    expect(label).not.toContain(item.valetSessionId);
    expect(label).not.toContain(String(item.position!.latitude));
    expect(label).not.toContain(String(item.position!.longitude));
  });
});
