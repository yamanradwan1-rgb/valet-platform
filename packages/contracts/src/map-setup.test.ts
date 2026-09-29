import { describe, expect, it } from "vitest";
import {
  createLocationMapAreaRequestSchema,
  createLocationMapPointRequestSchema,
  locationMapAreaSchema,
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
const token = "2026-09-29T18:00:00.000Z";

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
    expect(
      updateLocationMapPointRequestSchema.parse({
        active: false,
        expectedUpdatedAt: token,
      }),
    ).toEqual(
      { active: false, expectedUpdatedAt: token },
    );
    expect(updateLocationMapPointRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateLocationMapPointRequestSchema.safeParse({
        expectedUpdatedAt: token,
      }).success,
    ).toBe(false);
    expect(
      updateLocationMapPointRequestSchema.safeParse({
        active: false,
        expectedUpdatedAt: "not-a-date",
      }).success,
    ).toBe(false);
    expect(
      updateLocationMapPointRequestSchema.safeParse({
        actorId: crypto.randomUUID(),
        expectedUpdatedAt: token,
      }).success,
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
    expect(
      replaceLocationMapAreaVerticesRequestSchema.parse({
        expectedUpdatedAt: token,
        vertices,
      }),
    ).toEqual(
      { expectedUpdatedAt: token, vertices },
    );
    expect(
      replaceLocationMapAreaVerticesRequestSchema.safeParse({
        expectedUpdatedAt: token,
        vertices: [vertices[0], vertices[1], { latitude: 0, longitude: 181 }],
      }).success,
    ).toBe(false);
    expect(
      replaceLocationMapAreaVerticesRequestSchema.safeParse({
        expectedUpdatedAt: "not-a-date",
        vertices,
      }).success,
    ).toBe(false);
    expect(updateLocationMapAreaRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateLocationMapAreaRequestSchema.safeParse({
        expectedUpdatedAt: token,
      }).success,
    ).toBe(false);
    expect(
      updateLocationMapAreaRequestSchema.safeParse({
        expectedUpdatedAt: token,
        label: "Updated",
      }).success,
    ).toBe(true);
    expect(
      updateLocationMapAreaRequestSchema.safeParse({
        expectedUpdatedAt: token,
        vertices,
      }).success,
    ).toBe(false);
  });

  it("caps persisted area response geometry at 500 vertices", () => {
    const area = {
      active: true,
      code: "PARKING_MAIN",
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      label: "Main parking",
      levelLabel: null,
      parkingZoneId: null,
      parkingZone: null,
      purpose: "PARKING",
      updatedAt: new Date().toISOString(),
      vertices: Array.from({ length: 501 }, (_, position) => ({
        latitude: 1,
        longitude: 1,
        position,
      })),
    };
    expect(locationMapAreaSchema.safeParse(area).success).toBe(false);
  });
});
