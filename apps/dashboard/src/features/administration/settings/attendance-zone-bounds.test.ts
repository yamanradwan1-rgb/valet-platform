import { describe, expect, it } from "vitest";
import { attendanceZoneBoundPoints } from "./attendance-zone-bounds";

describe("saved attendance circle map bounds", () => {
  it("includes all four radial extrema for one 1000m zone", () => {
    const points = attendanceZoneBoundPoints({
      latitude: 32.556,
      longitude: 35.862,
      radiusMeters: 1000,
    });
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ lat: 32.556, lng: 35.862 });
    expect(Math.max(...points.map((point) => point.lat))).toBeGreaterThan(
      32.564,
    );
    expect(Math.min(...points.map((point) => point.lat))).toBeLessThan(32.548);
    expect(Math.max(...points.map((point) => point.lng))).toBeGreaterThan(
      35.871,
    );
    expect(Math.min(...points.map((point) => point.lng))).toBeLessThan(35.853);
  });

  it("uses true radius, including a 5m decimal-compatible minimum", () => {
    const large = attendanceZoneBoundPoints({
      latitude: 0,
      longitude: 0,
      radiusMeters: 1000,
    });
    const small = attendanceZoneBoundPoints({
      latitude: 0,
      longitude: 0,
      radiusMeters: 5,
    });
    expect(large[1]?.lat).toBeCloseTo(0.0089932, 5);
    expect(small[1]?.lat).toBeCloseTo(0.000044966, 7);
    expect(large[1]!.lat).toBeGreaterThan(small[1]!.lat);
  });

  it("wraps the eastern and western edges across the antimeridian", () => {
    const points = attendanceZoneBoundPoints({
      latitude: 0,
      longitude: 179.999,
      radiusMeters: 1000,
    });
    expect(points.some((point) => point.lng > 179.99)).toBe(true);
    expect(points.some((point) => point.lng < -179.99)).toBe(true);
    expect(points.every((point) => point.lng >= -180 && point.lng <= 180)).toBe(
      true,
    );
  });

  it("combines the full outlines of multiple zones, including smaller radii", () => {
    const zones = [
      { latitude: 31.95, longitude: 35.9, radiusMeters: 1000 },
      { latitude: 32.55, longitude: 35.85, radiusMeters: 77.25 },
    ];
    const points = zones.flatMap(attendanceZoneBoundPoints);
    expect(points).toHaveLength(10);
    expect(Math.min(...points.map((point) => point.lat))).toBeLessThan(31.95);
    expect(Math.max(...points.map((point) => point.lat))).toBeGreaterThan(32.55);
    expect(Math.min(...points.map((point) => point.lng))).toBeLessThan(35.85);
    expect(Math.max(...points.map((point) => point.lng))).toBeGreaterThan(35.9);
  });

  it("covers all longitude directions for circles crossing a pole", () => {
    const points = attendanceZoneBoundPoints({
      latitude: 89.999,
      longitude: 20,
      radiusMeters: 1000,
    });
    expect(points.some((point) => point.lat === 90)).toBe(true);
    expect(points).toHaveLength(8);
    expect(points.some((point) => point.lng === 110)).toBe(true);
    expect(points.some((point) => point.lng === -160)).toBe(true);
  });

  it("refuses invalid circles rather than inventing a center", () => {
    for (const radiusMeters of [0, 4.99, 1000.01, Number.NaN]) {
      expect(
        attendanceZoneBoundPoints({ latitude: 32, longitude: 35, radiusMeters }),
      ).toEqual([]);
    }
  });
});
