import { describe, expect, it } from "vitest";
import { issue414HttpEvidenceComplete } from "./issue414-http-evidence";

describe("Issue414 HTTP evidence integrity", () => {
  const completed = [
    { complete: true },
    { complete: true },
    { complete: true },
  ];

  it("never claims complete before every final assertion and cleanup passes", () => {
    expect(issue414HttpEvidenceComplete(false, completed)).toBe(false);
  });

  it("rejects missing cohorts and any incomplete cohort", () => {
    expect(issue414HttpEvidenceComplete(true, completed.slice(0, 2))).toBe(
      false,
    );
    expect(
      issue414HttpEvidenceComplete(true, [
        { complete: true },
        { complete: false },
        { complete: true },
      ]),
    ).toBe(false);
  });

  it("claims complete only with three successful cohorts and final checks", () => {
    expect(issue414HttpEvidenceComplete(true, completed)).toBe(true);
  });
});
