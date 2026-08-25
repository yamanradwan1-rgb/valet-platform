import { describe, expect, it } from "vitest";

import {
  markerFeature,
  polygonFeature,
  toDomainCoordinate,
  toGeoJsonPosition,
  type MapGeoPolygon,
} from "./map-geo";

/**
 * Asymmetric values on purpose: latitude and longitude are deliberately
 * different numbers so a lat/lng reversal can never accidentally pass.
 */
const LATITUDE = 32.562703;
const LONGITUDE = 35.880055;

describe("domain -> GeoJSON coordinate order", () => {
  it("converts {latitude, longitude} to [longitude, latitude]", () => {
    const position = toGeoJsonPosition({
      latitude: LATITUDE,
      longitude: LONGITUDE,
    });
    expect(position[0]).toBe(LONGITUDE);
    expect(position[1]).toBe(LATITUDE);
    expect(position).toEqual([35.880055, 32.562703]);
  });

  it("maps point markers to GeoJSON positions [lng, lat]", () => {
    const feature = markerFeature({
      color: "#176bff",
      id: "point-1",
      latitude: LATITUDE,
      longitude: LONGITUDE,
      selected: false,
    });
    expect(feature.geometry.coordinates[0]).toBe(LONGITUDE);
    expect(feature.geometry.coordinates[1]).toBe(LATITUDE);
    expect(feature.geometry.type).toBe("Point");
  });

  it("maps polygon vertices in order to GeoJSON rings [lng, lat]", () => {
    const polygon: MapGeoPolygon = {
      color: "#d95c63",
      id: "area-1",
      selected: true,
      vertices: [
        { latitude: 32.5625, longitude: 35.88 },
        { latitude: 32.5628, longitude: 35.8805 },
        { latitude: 32.5623, longitude: 35.8807 },
      ],
    };
    const feature = polygonFeature(polygon);
    if (feature === null) throw new Error("expected a valid polygon");
    const ring = feature.geometry.coordinates[0];
    expect(ring).toHaveLength(4); // A,B,C + render-only closure back to A
    // Every ring pair must be [longitude, latitude] of the same vertex.
    for (let index = 0; index < 3; index += 1) {
      const vertex = polygon.vertices[index];
      const pair = ring[index];
      expect(pair?.[0]).toBe(vertex?.longitude);
      expect(pair?.[1]).toBe(vertex?.latitude);
    }
    // Render-only closure: last internal ring vertex equals the FIRST.
    expect(ring[3]).toEqual(ring[0]);
  });
});

describe("GeoJSON/provider events -> domain", () => {
  it("converts provider lng/lat positions to {latitude, longitude}", () => {
    const click = toDomainCoordinate({ lat: LATITUDE, lng: LONGITUDE });
    expect(click.latitude).toBe(LATITUDE);
    expect(click.longitude).toBe(LONGITUDE);
    // The classic swap mistake would produce {latitude: 35.88..., ...}.
    expect(click.latitude).not.toBe(LONGITUDE);
    expect(click.longitude).not.toBe(LATITUDE);
  });
});

describe("polygon closure isolation", () => {
  it("never mutates the caller's stored vertex array", () => {
    const vertices = [
      { latitude: 32.5625, longitude: 35.88 },
      { latitude: 32.5628, longitude: 35.8805 },
      { latitude: 32.5623, longitude: 35.8807 },
    ];
    const frozen = [...vertices];
    const feature = polygonFeature({ id: "area-1", vertices });
    expect(feature).not.toBeNull();
    // Stored domain data still holds exactly A, B, C.
    expect(vertices).toEqual(frozen);
    expect(vertices).toHaveLength(3);
    expect(vertices[0]).not.toEqual(vertices[vertices.length - 1]);
    // And an already-closed input is not closed twice.
    const closed = polygonFeature({
      id: "area-2",
      vertices: [
        ...vertices,
        { latitude: 32.5625, longitude: 35.88 },
      ],
    });
    const ring = closed !== null ? closed.geometry.coordinates[0] : [];
    expect(ring).toHaveLength(4);
  });

  it("returns null below three vertices instead of guessing", () => {
    expect(
      polygonFeature({
        id: "area-3",
        vertices: [
          { latitude: 1, longitude: 2 },
          { latitude: 3, longitude: 4 },
        ],
      }),
    ).toBeNull();
  });
});
