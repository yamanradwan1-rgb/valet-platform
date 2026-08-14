import { describe, expect, it } from "vitest";
import {
  createLocationMapAreaRequestSchema,
  createLocationMapPointRequestSchema,
  replaceLocationMapAreaVerticesRequestSchema,
  updateLocationMapAreaRequestSchema,
  updateLocationMapPointRequestSchema,
} from "./map-setup";

const point = {
  active: true,
  code: "ENTRANCE_MAIN",
  kind: "ENTRANCE",
  label: "Main entrance",
  latitude: 31.9539,
  levelLabel: null,
  longitude: 35.9106,
};
const vertices = [
  { latitude: 31.95, longitude: 35.91 },
  { latitude: 31.96, longitude: 35.91 },
  { latitude: 31.96, longitude: 35.92 },
];

describe("Location map setup contracts", () => {
  it("accepts only the approved point configuration shape", () => {
    expect(createLocationMapPointRequestSchema.parse(point)).toEqual(point);
    for (const invalid of [
      { ...point, latitude: 91 },
      { ...point, longitude: -181 },
      { ...point, kind: "GARAGE" },
      { ...point, organizationId: crypto.randomUUID() },
      { ...point, membershipId: crypto.randomUUID() },
    ]) {
      expect(createLocationMapPointRequestSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });

  it("accepts non-empty strict point patches", () => {
    expect(updateLocationMapPointRequestSchema.parse({ active: false })).toEqual(
      { active: false },
    );
    expect(updateLocationMapPointRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateLocationMapPointRequestSchema.safeParse({ actorId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  });

  it("requires a typed area and at least three valid ordered vertices", () => {
    const area = {
      active: true,
      code: "PARKING_MAIN",
      label: "Main parking",
      levelLabel: "B1",
      parkingZoneId: null,
      purpose: "PARKING",
      vertices,
    };
    expect(createLocationMapAreaRequestSchema.parse(area)).toEqual(area);
    expect(
      createLocationMapAreaRequestSchema.safeParse({
        ...area,
        vertices: vertices.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      createLocationMapAreaRequestSchema.safeParse({
        ...area,
        purpose: "DIGITAL_TWIN",
      }).success,
    ).toBe(false);
  });

  it("validates replacement vertices and strict area patches", () => {
    expect(replaceLocationMapAreaVerticesRequestSchema.parse({ vertices })).toEqual(
      { vertices },
    );
    expect(
      replaceLocationMapAreaVerticesRequestSchema.safeParse({
        vertices: [vertices[0], vertices[1], { latitude: 0, longitude: 181 }],
      }).success,
    ).toBe(false);
    expect(updateLocationMapAreaRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateLocationMapAreaRequestSchema.safeParse({ vertices }).success,
    ).toBe(false);
  });
});
