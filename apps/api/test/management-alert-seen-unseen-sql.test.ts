import { describe, expect, it } from "vitest";

import type { SeenOccurrenceCategory } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-source";
import { unseenOccurrenceAntiJoin } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-unseen-sql";

describe("Issue #414 per-user source-side unseen predicates", () => {
  it.each([
    ["ALT-05", "takeover.operation_id"],
    ["ALT-07", "event.id"],
    ["ALT-09", "event.id"],
    ["ALT-13", "event.id"],
    ["ALT-15", "event.id"],
  ] as const)("links %s to the exact committed identity", (category, identity) => {
    const clause = unseenOccurrenceAntiJoin(category, 4);
    expect(clause).toContain("NOT EXISTS");
    expect(clause).toContain(`seen.category = '${category}'`);
    expect(clause).toContain(`seen.source_id = ${identity}`);
    expect(clause).toContain("seen.user_id = $4::uuid");
    expect(clause).toContain("seen.organization_id = ");
    expect(clause).not.toMatch(/DELETE|UPDATE|INSERT|raw_gps|latitude|longitude|LIMIT/i);
  });

  it("keeps ALT-15's smaller parameter list and rejects non-constant binds", () => {
    expect(unseenOccurrenceAntiJoin("ALT-15", 3))
      .toContain("seen.user_id = $3::uuid");
    for (const value of [0, -1, 33, NaN, 2.5, Infinity]) {
      expect(() => unseenOccurrenceAntiJoin("ALT-15", value)).toThrow(RangeError);
    }
  });

  it("maintains distinct categories even when audit UUIDs are the same", () => {
    const byCategory = ["ALT-07", "ALT-13", "ALT-15"] as const;
    const clauses = byCategory.map((category: SeenOccurrenceCategory) =>
      unseenOccurrenceAntiJoin(category, 3),
    );
    expect(new Set(clauses).size).toBe(3);
  });

  it("rejects runtime category interpolation outside the closed allowlist", () => {
    expect(() => unseenOccurrenceAntiJoin(
      "ALT-15' OR TRUE --" as SeenOccurrenceCategory, 3,
    )).toThrow(RangeError);
  });
});
