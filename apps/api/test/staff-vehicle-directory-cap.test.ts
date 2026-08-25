import { describe, expect, it } from "vitest";

import {
  applyDirectoryPageCap,
  DIRECTORY_PAGE_LIMIT,
} from "../src/modules/staff/staff-vehicle-directory.queries";

describe("vehicle directory page cap", () => {
  it("keeps small result sets and reports no truncation", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const page = applyDirectoryPageCap(rows);
    expect(page.rows).toEqual(rows);
    expect(page.truncated).toBe(false);
  });

  it("keeps exactly one hundred rows without truncation", () => {
    const rows = Array.from({ length: DIRECTORY_PAGE_LIMIT }, (_, index) => ({
      id: index,
    }));
    const page = applyDirectoryPageCap(rows);
    expect(page.rows).toHaveLength(DIRECTORY_PAGE_LIMIT);
    expect(page.truncated).toBe(false);
  });

  it("trims an overflowing fetch to one hundred and flags truncation", () => {
    const rows = Array.from(
      { length: DIRECTORY_PAGE_LIMIT + 1 },
      (_, index) => ({ id: index }),
    );
    const page = applyDirectoryPageCap(rows);
    expect(page.rows).toHaveLength(DIRECTORY_PAGE_LIMIT);
    expect(page.rows[0]).toEqual({ id: 0 });
    expect(page.truncated).toBe(true);
  });
});
