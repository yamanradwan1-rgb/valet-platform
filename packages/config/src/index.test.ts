import { describe, expect, it } from "vitest";

import { workspaceNames } from "./index";

describe("workspaceNames", () => {
  it("lists the four Phase 0 applications", () => {
    expect(workspaceNames).toHaveLength(4);
  });
});
