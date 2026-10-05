import type {
  LiveOperationsMapResponse,
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  SINGLE_POINT_ZOOM,
  WORLD_ZOOM,
  decideOperationalMapCamera,
  projectOperationalMap,
} from "./operational-map-model";

type LiveItem = LiveOperationsMapResponse["items"][number];

const liveItem: LiveItem = {
  assigneeMembershipId: "55555555-5555-4555-8555-555555555501",
  position: {
    areas: [{
      code: "P-A",
      label: "Parking Area A",
      levelLabel: "B1",
      mapAreaId: "77777777-7777-4777-8777-777777777701",
      parkingZoneId: "77777777-7777-4777-8777-777777777702",
      purpose: "PARKING",
    }],
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
    temporaryDescriptor: null,
    vehicleId: "77777777-7777-4777-8777-777777777706",
  },
};

const point: LocationMapPoint = {
  active: true,
  code: "GATE-A",
  createdAt: "2026-09-20T10:00:00.000Z",
  id: "88888888-8888-4888-8888-888888888801",
  kind: "ENTRANCE",
  label: "Gate A",
  latitude: 31.9545,
  levelLabel: "L1",
  longitude: 35.9115,
  updatedAt: "2026-09-20T10:00:00.000Z",
};

const area: LocationMapArea = {
  active: false,
  code: "OVERFLOW-A",
  createdAt: "2026-09-20T10:00:00.000Z",
  id: "99999999-9999-4999-8999-999999999901",
  label: "Overflow A",
  levelLabel: "B2",
  parkingZone: null,
  parkingZoneId: "99999999-9999-4999-8999-999999999902",
  purpose: "OVERFLOW",
  updatedAt: "2026-09-20T10:00:00.000Z",
  vertices: [
    { latitude: 31.95, longitude: 35.90, position: 0 },
    { latitude: 31.96, longitude: 35.91, position: 1 },
    { latitude: 31.955, longitude: 35.92, position: 2 },
  ],
};

describe("operational map model", () => {
  it("projects only positioned current-page live items with exact coordinates and safe state labels", () => {
    const stale: LiveItem = {
      ...liveItem,
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      position: { ...liveItem.position!, freshness: "STALE", latitude: 31.97 },
    };
    const noPosition: LiveItem = {
      ...liveItem,
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      position: null,
    };

    const model = projectOperationalMap({
      items: [liveItem, stale, noPosition],
      locale: "en",
      timezone: "Asia/Amman",
    });

    expect(model.liveMarkers).toHaveLength(2);
    expect(model.liveMarkers[0]).toMatchObject({
      rendererKey: liveItem.taskId,
      position: { lat: 31.9539, lng: 35.9106 },
      state: "LIVE",
    });
    expect(model.liveMarkers[1]).toMatchObject({
      position: { lat: 31.97, lng: 35.9106 },
      state: "STALE",
    });
    expect(model.liveMarkers[0]!.label).toContain("12-34567");
    expect(model.liveMarkers[0]!.label).toContain("Live");
    expect(model.liveMarkers[1]!.label).toContain("Last known");

    const labels = model.liveMarkers.map((marker) => marker.label).join(" ");
    for (const privateValue of [
      liveItem.taskId,
      liveItem.assigneeMembershipId,
      liveItem.trackingSessionId,
      liveItem.valetSessionId,
      liveItem.vehicle.vehicleId,
      liveItem.position!.areas[0]!.mapAreaId,
      liveItem.position!.areas[0]!.parkingZoneId!,
      String(liveItem.position!.latitude),
      String(liveItem.position!.longitude),
    ]) {
      expect(labels).not.toContain(privateValue);
    }
  });

  it("projects LM points with exact position, kind, level, active state, and no ID in the label", () => {
    const model = projectOperationalMap({ items: [], locale: "en", points: [point] });

    expect(model.pointMarkers).toEqual([{
      rendererKey: point.id,
      position: { lat: 31.9545, lng: 35.9115 },
      label: "Gate A · \u2066GATE-A\u2069 · L1 · Entrance · Active",
      active: true,
      kind: "ENTRANCE",
      levelLabel: "L1",
    }]);
    expect(model.pointMarkers[0]!.label).not.toContain(point.id);
  });

  it("preserves ordered area vertices plus purpose and active metadata without exposing IDs in labels", () => {
    const model = projectOperationalMap({ areas: [area], items: [], locale: "en" });

    expect(model.polygons).toEqual([{
      rendererKey: area.id,
      path: [
        { lat: 31.95, lng: 35.90 },
        { lat: 31.96, lng: 35.91 },
        { lat: 31.955, lng: 35.92 },
      ],
      label: "Overflow A (\u2066OVERFLOW-A\u2069) · Overflow · B2 · Inactive",
      active: false,
      purpose: "OVERFLOW",
      levelLabel: "B2",
    }]);
    expect(model.polygons[0]!.label).not.toContain(area.id);
    expect(model.polygons[0]!.label).not.toContain(area.parkingZoneId!);
  });

  it("uses neutral world camera when no rendered geography exists", () => {
    expect(decideOperationalMapCamera([])).toEqual({
      kind: "WORLD",
      center: { lat: 0, lng: 0 },
      zoom: WORLD_ZOOM,
    });

    const noPosition = { ...liveItem, position: null };
    expect(projectOperationalMap({ items: [noPosition], locale: "en" }).camera.kind)
      .toBe("WORLD");
  });

  it("uses bounded single-point zoom after deduplicating coincident rendered coordinates", () => {
    expect(decideOperationalMapCamera([
      { lat: 31.9539, lng: 35.9106 },
      { lat: 31.9539, lng: 35.9106 },
    ])).toEqual({
      kind: "SINGLE",
      center: { lat: 31.9539, lng: 35.9106 },
      zoom: SINGLE_POINT_ZOOM,
    });
  });

  it("derives multi-coordinate bounds from only the rendered model geography", () => {
    const model = projectOperationalMap({
      areas: [area],
      items: [liveItem],
      locale: "en",
      points: [point],
    });

    expect(model.camera).toEqual({
      kind: "BOUNDS",
      north: 31.96,
      south: 31.95,
      east: 35.92,
      west: 35.90,
    });
  });
});
