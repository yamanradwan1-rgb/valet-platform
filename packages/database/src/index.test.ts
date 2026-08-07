import { describe, expect, it } from "vitest";

import { databasePackageName } from "./index";

describe("database package", () => {
  it("does not expose a Phase 0 domain model", () => {
    expect(databasePackageName).toBe("@valet/database");
  });
});
