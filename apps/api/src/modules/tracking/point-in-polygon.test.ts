import { describe, expect, it } from "vitest";

import { pointInPolygon } from "./point-in-polygon";

const square = [
  { latitude: "31.000000", longitude: "35.000000" },
  { latitude: "31.000000", longitude: "36.000000" },
  { latitude: "32.000000", longitude: "36.000000" },
  { latitude: "32.000000", longitude: "35.000000" },
];

describe("provider-neutral point-in-polygon", () => {
  it("classifies a clear inside and outside point", () => {
    expect(
      pointInPolygon({ latitude: "31.500000", longitude: "35.500000" }, square),
    ).toBe(true);
    expect(
      pointInPolygon({ latitude: "33.000000", longitude: "38.000000" }, square),
    ).toBe(false);
  });

  it("counts an exact polygon edge as inside", () => {
    expect(
      pointInPolygon({ latitude: "31.500000", longitude: "35.000000" }, square),
    ).toBe(true);
  });

  it("counts an exact polygon vertex as inside", () => {
    expect(pointInPolygon(square[0]!, square)).toBe(true);
  });
});
