import { describe, expect, it } from "vitest";
import { canonicalizeGuestRatingComment } from "./guest-rating-comment.js";
import vectors from "./fixtures/guest-rating-canonical-199.json";

/**
 * Archived, hash-verified P0 v1.2 canonical vectors. This is an independent
 * frozen expected-output fixture, not newly calculated from the implementation.
 * SHA-256: f48a3bf03b73574de9962b76e05b4ecc167167ac8a3129d0a011516c96e39f7b
 */
describe("Issue #463 CT-03–07 pinned canonical oracle", () => {
  it("uses exactly the independently verified 199 historical cases", () => {
    expect(vectors).toHaveLength(199);
  });

  it.each(vectors.map((vector, index) => ({ ...vector, index })))(
    "agrees with historical TS/PG result for vector $index",
    ({ input, expected }) => {
      let actual: { ok: true; v: string | null } | { ok: false };
      try {
        actual = { ok: true, v: canonicalizeGuestRatingComment(input) };
      } catch {
        actual = { ok: false };
      }
      expect(actual).toEqual(expected);
    },
  );
});
